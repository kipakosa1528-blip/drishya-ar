/**
 * Kipakosa AR — Video & Image Optical Reveal Engine
 * 
 * Capabilities:
 * 1. Supports direct Video layers (<video class="layer-image-b layer-video">)
 * 2. Automatically extracts & paints the first frame as the static physical photo (Image A)
 * 3. On pointer hover / touch drag, dynamically reveals the live playing video inside the optical radius
 * 4. Zero UI slider handles or before/after slop; pure optical coordinate masking
 */

(function () {
  'use strict';

  const revealContainers = document.querySelectorAll('.js-reveal-container');

  revealContainers.forEach((container) => {
    const revealedLayer = container.querySelector('.layer-image-b');
    const staticLayer = container.querySelector('.layer-image-a');
    const opticalLens = container.querySelector('.reveal-optical-lens');
    if (!revealedLayer) return;

    const isVideo = revealedLayer.tagName.toLowerCase() === 'video';

    // If it's a video, ensure proper inline playback & auto-extract first frame if needed
    if (isVideo) {
      revealedLayer.muted = true;
      revealedLayer.playsInline = true;
      revealedLayer.loop = true;

      // Ensure video plays smoothly
      revealedLayer.addEventListener('loadeddata', () => {
        // If staticLayer is a canvas and needs first frame
        if (staticLayer && staticLayer.tagName.toLowerCase() === 'canvas') {
          const ctx = staticLayer.getContext('2d');
          staticLayer.width = revealedLayer.videoWidth || 1280;
          staticLayer.height = revealedLayer.videoHeight || 720;
          ctx.drawImage(revealedLayer, 0, 0, staticLayer.width, staticLayer.height);
        }
      });
    }

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

    function startReveal(clientX, clientY) {
      isTracking = true;
      container.classList.add('is-interacting');
      if (isVideo) {
        revealedLayer.play().catch(() => {});
      }
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

    // Pointer events (mouse, stylus, high-res trackpad)
    container.addEventListener('pointerenter', (e) => {
      startReveal(e.clientX, e.clientY);
    });

    container.addEventListener('pointermove', (e) => {
      if (!isTracking) {
        startReveal(e.clientX, e.clientY);
      }
      updateCoordinates(e.clientX, e.clientY);
    });

    container.addEventListener('pointerleave', () => {
      stopReveal();
    });

    // Touch fallback (drag across physical image to reveal)
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        startReveal(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        updateCoordinates(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      stopReveal();
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
