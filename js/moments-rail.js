// Living Moments Character Filmstrip Carousel
// ThreeUI Arc Filmstrip depth algorithm with physics, drag, wheel, touch & auto-play.

(function () {
  'use strict';

  const stage = document.querySelector('[data-moments-rail]');
  if (!stage || stage.dataset.railReady) return;
  stage.dataset.railReady = '1';

  const viewport = stage.querySelector('.rail-viewport');
  const track = stage.querySelector('.rail');
  if (!track) return;
  const cards = Array.from(track.querySelectorAll('.moment-card'));
  const N = cards.length;
  if (N < 2) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    stage.classList.add('rail-static');
    return;
  }

  let progress = 0;        // Current floating index position
  let targetProgress = 0;  // Target index position to smoothly interpolate towards
  let vel = 0;             // Drag velocity
  let isDragging = false;
  let startX = 0;
  let lastX = 0;
  let lastTime = 0;
  let dragDistance = 0;
  let activeIndex = -1;
  let lastInteract = performance.now();

  const videos = new Map(); // card -> video element

  // Initialize video elements inside photo wraps
  cards.forEach((card, idx) => {
    const photoWrap = card.querySelector('.moment-photo-wrap');
    if (!photoWrap) return;
    const vSrc = card.getAttribute('data-video');
    if (vSrc) {
      const v = document.createElement('video');
      v.src = vSrc;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';
      v.className = 'moment-video';
      photoWrap.appendChild(v);
      videos.set(card, v);
    }

    card.addEventListener('click', (e) => {
      if (dragDistance > 8) return; // was a drag
      lastInteract = performance.now();
      const diff = getWrappedDiff(idx, progress);
      if (Math.abs(diff) < 0.3) {
        // Toggle video play/pause on the active card
        const v = videos.get(card);
        if (v) {
          if (v.paused) playCard(card);
          else pauseCard(card);
        }
      } else {
        // Smoothly center the clicked card
        targetProgress = Math.round(progress) + diff;
        vel = 0;
      }
    });
  });

  function playCard(card) {
    const v = videos.get(card);
    if (v) {
      v.play().catch(() => {});
      card.classList.add('is-playing');
    }
  }

  function pauseCard(card) {
    const v = videos.get(card);
    if (v) {
      v.pause();
      card.classList.remove('is-playing');
    }
  }

  function getWrappedDiff(i, p) {
    let diff = (i - (p % N) + N) % N;
    if (diff > N / 2) diff -= N;
    return diff;
  }

  function updateLayout() {
    const spacing = Math.min(235, Math.max(140, window.innerWidth * 0.17));
    const maxVisible = 4.2;

    let closestIdx = 0;
    let closestAbs = Infinity;

    for (let i = 0; i < N; i++) {
      let diff = getWrappedDiff(i, progress);
      const absDiff = Math.abs(diff);

      if (absDiff < closestAbs) {
        closestAbs = absDiff;
        closestIdx = i;
      }

      if (absDiff > maxVisible) {
        cards[i].style.display = 'none';
        continue;
      }

      cards[i].style.display = 'block';

      // 3D Filmstrip Arc Formula (concentric arc depth progression)
      const sign = Math.sign(diff) || 0;
      const tx = diff * spacing;
      const tz = -Math.pow(absDiff, 1.28) * 88;
      const rotY = -sign * Math.min(32, Math.pow(absDiff, 0.85) * 16);
      const scale = Math.max(0.46, 1 - absDiff * 0.12);
      const opacity = Math.max(0, 1 - absDiff * 0.22);
      const brightness = Math.max(0.42, 1 - absDiff * 0.15);
      const zIndex = Math.round(100 - absDiff * 10);

      cards[i].style.zIndex = zIndex;
      cards[i].style.opacity = opacity.toFixed(3);
      cards[i].style.filter = `brightness(${brightness.toFixed(3)})`;
      cards[i].style.transform = `translateX(${tx.toFixed(1)}px) translateZ(${tz.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    }

    if (closestIdx !== activeIndex) {
      if (activeIndex >= 0 && cards[activeIndex]) {
        cards[activeIndex].classList.remove('is-front');
        pauseCard(cards[activeIndex]);
      }
      activeIndex = closestIdx;
      if (cards[activeIndex]) {
        cards[activeIndex].classList.add('is-front');
        playCard(cards[activeIndex]);
      }
    }
  }

  // Pointer & Drag handling
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.rail-arrow')) return;
    isDragging = true;
    dragDistance = 0;
    startX = lastX = e.clientX;
    lastTime = performance.now();
    lastInteract = performance.now();
    vel = 0;
    try { stage.setPointerCapture(e.pointerId); } catch {}
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    dragDistance += Math.abs(dx);
    lastX = e.clientX;

    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    lastTime = now;
    lastInteract = now;

    const cardWidth = cards[0]?.offsetWidth || 260;
    const sensitivity = 1.3 / cardWidth;
    progress -= dx * sensitivity;
    targetProgress = progress;
    vel = -dx * sensitivity * (16.7 / dt);
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    lastInteract = performance.now();
    // Snap to nearest integer slot with momentum
    targetProgress = Math.round(progress + vel * 8);
  }

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Wheel handling
  viewport.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      lastInteract = performance.now();
      targetProgress += Math.sign(e.deltaX);
    }
  }, { passive: false });

  // Keyboard navigation
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      lastInteract = performance.now();
      targetProgress -= 1;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      lastInteract = performance.now();
      targetProgress += 1;
    }
  });

  // Next / Prev button triggers
  document.querySelectorAll('[data-rail-prev]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      lastInteract = performance.now();
      targetProgress = Math.round(targetProgress) - 1;
    });
  });

  document.querySelectorAll('[data-rail-next]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      lastInteract = performance.now();
      targetProgress = Math.round(targetProgress) + 1;
    });
  });

  // Animation render loop
  function tick(now) {
    if (!isDragging) {
      // Gentle auto-drift after 4s idle
      if (!reduced && now - lastInteract > 4000) {
        targetProgress += 0.003;
        progress += 0.003;
      } else {
        const diff = targetProgress - progress;
        if (Math.abs(diff) > 0.001) {
          progress += diff * 0.12;
        } else {
          progress = targetProgress;
        }
      }
    }
    updateLayout();
    requestAnimationFrame(tick);
  }

  // Initial layout & play first card
  updateLayout();
  if (cards[0]) {
    cards[0].classList.add('is-front');
    playCard(cards[0]);
  }
  requestAnimationFrame(tick);

})();
