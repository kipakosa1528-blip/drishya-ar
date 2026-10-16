/**
 * Kipakosa — lazy video loading.
 * Videos below the fold start with preload="none"; this switches them to
 * "auto" shortly before they scroll into view, so first load stays light but
 * hover/tap playback is still instant by the time a visitor reaches them.
 * Also keeps the background video still for visitors who prefer reduced motion.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    var bg = document.getElementById('pinned-bg-video');
    if (bg) { bg.removeAttribute('autoplay'); bg.pause(); bg.preload = 'metadata'; }
  }

  var videos = Array.prototype.filter.call(document.querySelectorAll('video'), function (v) {
    return v.preload === 'none';
  });
  if (!videos.length) return;

  function wake(v) {
    if (v.preload !== 'auto') v.preload = 'auto';
    if (v.readyState === 0 && v.networkState !== 2) v.load();
  }

  if (!('IntersectionObserver' in window)) { videos.forEach(wake); return; }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      wake(e.target);
    });
  }, { rootMargin: '100% 0px 100% 0px' }); // one screen of lead above and below

  videos.forEach(function (v) { io.observe(v); });
})();
