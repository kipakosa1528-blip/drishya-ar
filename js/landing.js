/**
 * Kipakosa AR — Image-to-Image Optical Reveal Engine
 * High-performance pointer & touch coordinate mapping for registered print layers.
 * Zero generic UI slop; pure optical mask interaction.
 */

(function () {
  'use strict';

  // Initialize reveal on any element with .js-reveal-container
  const revealContainers = document.querySelectorAll('.js-reveal-container');

  revealContainers.forEach((container) => {
    const revealedLayer = container.querySelector('.layer-image-b');
    const opticalLens = container.querySelector('.reveal-optical-lens');
    if (!revealedLayer) return;

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
      // Natural smoothing lerp
      currentX += (targetX - currentX) * 0.22;
      currentY += (targetY - currentY) * 0.22;

      revealedLayer.style.setProperty('--x', `${currentX.toFixed(2)}%`);
      revealedLayer.style.setProperty('--y', `${currentY.toFixed(2)}%`);

      if (isTracking) {
        animFrame = requestAnimationFrame(renderLoop);
      }
    }

    // Pointer events (mouse, stylus, high-res trackpad)
    container.addEventListener('pointerenter', (e) => {
      isTracking = true;
      container.classList.add('is-interacting');
      updateCoordinates(e.clientX, e.clientY);
      currentX = targetX;
      currentY = targetY;
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(renderLoop);
    });

    container.addEventListener('pointermove', (e) => {
      if (!isTracking) {
        isTracking = true;
        container.classList.add('is-interacting');
        cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(renderLoop);
      }
      updateCoordinates(e.clientX, e.clientY);
    });

    container.addEventListener('pointerleave', () => {
      isTracking = false;
      container.classList.remove('is-interacting');
      cancelAnimationFrame(animFrame);
    });

    // Touch fallback (drag across physical image to reveal)
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        isTracking = true;
        container.classList.add('is-interacting');
        const touch = e.touches[0];
        updateCoordinates(touch.clientX, touch.clientY);
        currentX = targetX;
        currentY = targetY;
        cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(renderLoop);
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        updateCoordinates(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      isTracking = false;
      container.classList.remove('is-interacting');
      cancelAnimationFrame(animFrame);
    });
  });

  // Mobile navigation hamburger toggle
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
