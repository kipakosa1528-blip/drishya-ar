/**
 * Kipakosa — landing polish: scroll progress line, section rail, reveal-on-scroll.
 * Purely additive: no existing markup or script is touched. Skipped entirely for
 * visitors who prefer reduced motion.
 */
(function () {
  'use strict';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var root = document.documentElement;
  root.classList.add('fx-on');

  /* ── 1. Scroll progress line ── */
  var bar = document.createElement('div');
  bar.className = 'fx-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  var ticking = false;
  function paintProgress() {
    ticking = false;
    var max = root.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(paintProgress); }
  }, { passive: true });
  paintProgress();

  /* ── 2. Section rail (wide screens) ── */
  var SECTIONS = [
    ['story', 'The living frame'],
    ['tiktok-demos', 'Reels'],
    ['exhibition', 'Exhibition'],
    ['works', 'Living works'],
    ['magazines', 'Magazines'],
    ['scanner', 'How it works'],
    ['demo', 'Live demo'],
    ['pricing', 'Pricing'],
    ['faq', 'FAQ']
  ];
  var rail = document.createElement('nav');
  rail.className = 'fx-rail';
  rail.setAttribute('aria-label', 'Page sections');
  var links = {};
  SECTIONS.forEach(function (s) {
    var el = document.getElementById(s[0]);
    if (!el) return;
    var a = document.createElement('a');
    a.href = '#' + s[0];
    a.setAttribute('aria-label', s[1]);
    a.innerHTML = '<span class="fx-dot"></span><span class="fx-label">' + s[1] + '</span>';
    rail.appendChild(a);
    links[s[0]] = a;
  });
  document.body.appendChild(rail);

  if ('IntersectionObserver' in window) {
    var visible = {};
    var railIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      var best = null;
      var bestRatio = 0;
      Object.keys(visible).forEach(function (id) { if (visible[id] > bestRatio) { best = id; bestRatio = visible[id]; } });
      Object.keys(links).forEach(function (id) { links[id].classList.toggle('is-active', id === best); });
      rail.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.6);
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75] });
    Object.keys(links).forEach(function (id) { railIO.observe(document.getElementById(id)); });
    window.addEventListener('scroll', function () {
      rail.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.6);
    }, { passive: true });

    /* ── 3. Reveal on scroll ── */
    var targets = document.querySelectorAll([
      '.intro-tag', '.intro-index-num', '.editorial-display-heading', '.intro-editorial-heading', '.intro-editorial-sub',
      '.story-label', '.story-heading', '.story-body', '.optical-step-row', '.ar-plan-card', '.faq-item',
      '.social-pill-btn', '.duo-caption', '.demo-editorial-grid > *'
    ].join(','));
    var vh = window.innerHeight;
    var revealIO = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = (n * 90) + 'ms';
        e.target.classList.add('fx-in');
        revealIO.unobserve(e.target);
        n += 1;
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    Array.prototype.forEach.call(targets, function (el) {
      // Anything already on screen at load stays as designed; only content below the fold glides in.
      if (el.getBoundingClientRect().top < vh * 0.9) return;
      el.classList.add('fx-reveal');
      revealIO.observe(el);
    });
  }
})();
