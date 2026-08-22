// Living Moments Filmstrip — DOM+CSS 3D perspective rail carousel.
// Replaces the old scroll-jacked exhibition reel. Pure vanilla; no deps.
//
// Behavior: idle drift rotation, drag/swipe with momentum, wheel nudge,
// arrow keys, click-to-select side cards, front card lifts; hover/tap the
// front card plays its video inside the frame (single playing instance).
// Reduced motion or init failure => static scroll-snap fallback row.

(function () {
  'use strict';

  const stage = document.querySelector('[data-moments-rail]');
  if (!stage || stage.dataset.railReady) return;
  stage.dataset.railReady = '1';

  const viewport = stage.querySelector('.rail-viewport');
  const track = stage.querySelector('.rail');
  const cards = Array.from(track.children);
  const N = cards.length;
  if (N < 2) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STEP = 360 / N;
  let radius = 420;
  let rot = 0;          // current rail rotation, degrees
  let vel = 0;          // momentum, deg per frame-ish
  let snapTarget = null;// tween target after momentum dies
  let dragging = false;
  let lastX = 0, lastT = 0, downX = 0, downY = 0, moved = 0;
  let focusIdx = -1;
  let inView = false, pageHidden = false;
  let rafId = 0, lastFrame = 0;
  let interactAt = 0;
  const videos = new Map(); // card -> video element
  const DRIFT = 3.0;        // deg/sec idle drift
  const IDLE_DELAY = 2600;  // ms after interaction before drift resumes

  // ── geometry ────────────────────────────────────────────────────────────
  function computeRadius() {
    const w = cards[0].offsetWidth || 240; // layout width � untransformed
    radius = Math.min(900, Math.max(300, Math.round(((w / 2) / Math.tan(Math.PI / N)) * 1.18)));
    track.style.setProperty('--rail-radius', radius + 'px');
  }

  function norm(a) {
    return ((a % 360) + 540) % 360 - 180; // (-180, 180]
  }

  function apply() {
    for (let i = 0; i < N; i++) {
      const a = norm(i * STEP + rot);
      const isF = i === focusIdx;
      if (!isF) {
        const t = 1 - Math.min(1, Math.abs(a) / 90);
        cards[i].style.opacity = (0.32 + 0.68 * t).toFixed(3);
        cards[i].style.filter = `saturate(${(0.5 + 0.5 * t).toFixed(3)})`;
      }
      const z = radius + (isF ? 70 : 0);
      cards[i].style.transform =
        `rotateY(${(i * STEP + rot).toFixed(3)}deg) translateZ(${z}px) translateY(${isF ? -14 : 0}px) scale(${isF ? 1.07 : 1})`;
    }
  }

  function updateFocus() {
    let best = 0, bestAbs = Infinity;
    for (let i = 0; i < N; i++) {
      const a = Math.abs(norm(i * STEP + rot));
      if (a < bestAbs) { bestAbs = a; best = i; }
    }
    if (best === focusIdx) { apply(); return; }
    if (focusIdx >= 0) {
      pauseCard(cards[focusIdx]);
      cards[focusIdx].classList.remove('is-front');
      cards[focusIdx].style.opacity = '';
      cards[focusIdx].style.filter = '';
    }
    focusIdx = best;
    cards[focusIdx].classList.add('is-front');
    apply();
  }

  // ── video manager ───────────────────────────────────────────────────────
  function getVideo(card) {
    let v = videos.get(card);
    if (!v) {
      v = document.createElement('video');
      v.src = card.getAttribute('data-video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';
      v.className = 'moment-video';
      card.querySelector('.moment-frame').appendChild(v);
      videos.set(card, v);
    }
    return v;
  }
  function playCard(card) {
    getVideo(card).play().catch(() => {});
    card.classList.add('is-playing');
  }
  function pauseCard(card) {
    const v = videos.get(card);
    if (v) v.pause();
    card.classList.remove('is-playing');
  }

  cards.forEach(card => {
    card.addEventListener('pointerenter', () => {
      if (card.classList.contains('is-front') && !reduced && matchMedia('(pointer: fine)').matches) {
        playCard(card);
      }
    });
    card.addEventListener('pointerleave', () => pauseCard(card));
    card.addEventListener('click', e => {
      if (moved > 8) return; // was a drag
      const i = cards.indexOf(card);
      if (i === focusIdx) {
        // toggle playback on the focused frame
        const v = getVideo(card);
        if (v.paused) { playCard(card); } else { pauseCard(card); }
      } else {
        bringToFront(i);
        e.preventDefault();
      }
    });
  });

  function bringToFront(i) {
    const cur = norm(i * STEP + rot);
    let delta = -cur;                       // rotate so this card sits at 0deg
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    snapTarget = rot + delta;
    vel = 0;
    noteInteraction();
  }

  function step(dir) {
    const base = snapTarget !== null ? snapTarget : rot;
    snapTarget = Math.round((base + dir * STEP) / STEP) * STEP;
    vel = 0;
    noteInteraction();
  }

  // ── input ───────────────────────────────────────────────────────────────
  function noteInteraction() {
    interactAt = performance.now();
  }

  stage.addEventListener('pointerdown', e => {
    dragging = true;
    moved = 0;
    lastX = downX = e.clientX;
    downY = e.clientY;
    lastT = performance.now();
    vel = 0;
    snapTarget = null;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    noteInteraction();
  });
  stage.addEventListener('pointermove', e => {
    if (!dragging || reduced) return;
    const dx = e.clientX - lastX;
    moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
    lastX = e.clientX;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    lastT = now;
    rot += dx * 0.22;
    vel = (dx * 0.22) * (16.7 / dt);
    noteInteraction();
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    noteInteraction();
    if (Math.abs(vel) < 0.05) {
      // gentle settle to nearest card slot
      snapTarget = Math.round(rot / STEP) * STEP;
    }
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Wheel nudges only on genuine horizontal intent — vertical page scroll untouched.
  viewport.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    step(e.deltaX > 0 ? 1 : -1);
  }, { passive: false });

  stage.tabIndex = 0;
  stage.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(-1); e.preventDefault(); }
  });

  document.querySelectorAll('[data-rail-prev]').forEach(b =>
    b.addEventListener('click', () => step(-1)));
  document.querySelectorAll('[data-rail-next]').forEach(b =>
    b.addEventListener('click', () => step(1)));

  // ── loop ────────────────────────────────────────────────────────────────
  function tick(now) {
    rafId = 0;
    const dt = Math.min(64, now - lastFrame || 16.7);
    lastFrame = now;

    if (!dragging) {
      if (Math.abs(vel) > 0.02) {
        rot += vel * (dt / 16.7);
        vel *= Math.pow(0.94, dt / 16.7);
        snapTarget = null;
      } else if (snapTarget !== null) {
        const diff = snapTarget - rot;
        if (Math.abs(diff) < 0.05) { rot = snapTarget; snapTarget = null; }
        else rot += diff * Math.min(1, 0.09 * (dt / 16.7));
      } else if (now - interactAt > IDLE_DELAY) {
        rot += DRIFT * (dt / 1000); // idle drift
      }
    }

    updateFocus();

    if (inView && !pageHidden) rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (!rafId && inView && !pageHidden && !reduced) {
      lastFrame = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  // ── lifecycle ───────────────────────────────────────────────────────────
  function resize() {
    computeRadius();
    if (reduced) return; // static mode: CSS handles layout
    apply();
    updateFocus();
  }

  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) startLoop(); else stopLoop();
  }, { rootMargin: '120px' }).observe(stage);

  document.addEventListener('visibilitychange', () => {
    pageHidden = document.hidden;
    if (pageHidden) {
      cards.forEach(c => pauseCard(c));
      stopLoop();
    } else {
      startLoop();
    }
  });

  window.addEventListener('resize', resize);

  // ── boot ────────────────────────────────────────────────────────────────
  if (reduced) {
    stage.classList.add('rail-static');
    // Static mode: native scroll-snap row; tap toggles playback lazily.
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const v = getVideo(card);
        if (v.paused) playCard(card); else pauseCard(card);
      });
    });
    computeRadius();
    return;
  }

  computeRadius();
  rot = 0;
  updateFocus();
  resize();
  inView = true; // IO will correct shortly
  startLoop();
})();



