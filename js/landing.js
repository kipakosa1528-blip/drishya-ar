/**
 * Kipakosa AR — Live Video Optical Reveal Engine
 * Seamless pointer-driven video aperture mask across physical prints.
 */

(function () {
  'use strict';

  // 1. Initialize Optical Reveal on all containers
  function setupReveal(container) {
    const revealedVideo = container.querySelector('.layer-video');
    const opticalLens = container.querySelector('.reveal-optical-lens');
    if (!revealedVideo) return;

    revealedVideo.muted = true;
    revealedVideo.playsInline = true;
    revealedVideo.loop = true;

    // Ensure video is playing in background ready for instant mask reveal
    revealedVideo.play().catch(() => {});

    let targetX = 50;
    let targetY = 50;
    let currentX = 50;
    let currentY = 50;
    let isTracking = false;
    let animFrame = null;

    function updateCoordinates(clientX, clientY) {
      const rect = container.getBoundingClientRect();
      const xPx = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const yPx = Math.max(0, Math.min(rect.height, clientY - rect.top));

      targetX = (xPx / rect.width) * 100;
      targetY = (yPx / rect.height) * 100;

      if (opticalLens) {
        opticalLens.style.setProperty('--lens-x', `${xPx}px`);
        opticalLens.style.setProperty('--lens-y', `${yPx}px`);
      }
    }

    function renderLoop() {
      currentX += (targetX - currentX) * 0.22;
      currentY += (targetY - currentY) * 0.22;

      revealedVideo.style.setProperty('--x', `${currentX.toFixed(2)}%`);
      revealedVideo.style.setProperty('--y', `${currentY.toFixed(2)}%`);

      if (isTracking) {
        animFrame = requestAnimationFrame(renderLoop);
      }
    }

    function startReveal(clientX, clientY) {
      isTracking = true;
      container.classList.add('is-interacting');
      revealedVideo.play().catch(() => {});
      updateCoordinates(clientX, clientY);
      currentX = targetX;
      currentY = targetY;
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(renderLoop);
    }

    function stopReveal() {
      isTracking = false;
      container.classList.remove('is-interacting');
      cancelAnimationFrame(animFrame);
    }

    container.addEventListener('pointerenter', (e) => startReveal(e.clientX, e.clientY));
    container.addEventListener('pointermove', (e) => {
      if (!isTracking) startReveal(e.clientX, e.clientY);
      updateCoordinates(e.clientX, e.clientY);
    });
    container.addEventListener('pointerleave', stopReveal);

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        startReveal(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updateCoordinates(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    container.addEventListener('touchend', stopReveal);
  }

  document.querySelectorAll('.js-reveal-container').forEach(setupReveal);

  // 2. Hero Live Exhibit Switcher Tabs
  const heroViewport = document.getElementById('hero-viewport');
  const heroPoster = document.getElementById('hero-poster');
  const heroVideo = document.getElementById('hero-video');
  const heroCatalogTag = document.getElementById('hero-catalog-tag');
  const exhibitTabs = document.querySelectorAll('.exhibit-tab');

  const heroExhibits = {
    'flags': {
      video: '/assets/exhibition/himalayan-flags.mp4',
      poster: '/assets/exhibition/himalayan-flags-poster.jpg',
      catalog: 'CATALOG № 0824 — HIMALAYAN PRAYER FLAGS (16:9 ARCHIVAL PRINT)',
      aspectClass: ''
    },
    'stupa': {
      video: '/assets/exhibition/boudhanath-stupa.mp4',
      poster: '/assets/exhibition/boudhanath-stupa-poster.jpg',
      catalog: 'CATALOG № 0825 — BOUDHANATH HOLY STUPA (9:16 HERITAGE CARD)',
      aspectClass: 'portrait'
    },
    'annapurna': {
      video: '/assets/exhibition/annapurna-golden.mp4',
      poster: '/assets/exhibition/annapurna-golden-poster.jpg',
      catalog: 'CATALOG № 0826 — ANNAPURNA GOLDEN PEAK (16:9 GALLERY EDITION)',
      aspectClass: ''
    },
    'dancer': {
      video: '/assets/exhibition/gurung-dancer.mp4',
      poster: '/assets/exhibition/gurung-dancer-poster.jpg',
      catalog: 'CATALOG № 0827 — HIMALAYAN CULTURAL DANCE (9:16 PORTRAIT FRAME)',
      aspectClass: 'portrait'
    }
  };

  exhibitTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const exhibitKey = tab.dataset.exhibit;
      const data = heroExhibits[exhibitKey];
      if (!data) return;

      exhibitTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (heroPoster) heroPoster.src = data.poster;
      if (heroVideo) {
        heroVideo.src = data.video;
        heroVideo.play().catch(() => {});
      }
      if (heroCatalogTag) heroCatalogTag.textContent = data.catalog;
      
      if (heroViewport) {
        heroViewport.className = `reveal-viewport js-reveal-container ${data.aspectClass}`;
      }
    });
  });

  // 3. Auto-play all filmstrip looping videos
  document.querySelectorAll('.filmstrip-video').forEach(vid => {
    vid.muted = true;
    vid.playsInline = true;
    vid.loop = true;
    vid.play().catch(() => {});
  });

  // 4. Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('is-open');
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    navMenu.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('is-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();
