/**
 * Kipakosa AR — Cinematic Pinned Stage & Interactive 3D Living Frames Engine
 * Synthesized from Il Capo Production, Squarespace Brand, and Horeca Social.
 */

(function () {
  'use strict';

  // 1. Pinned Background Video Scroll Playback & Scrub
  function initPinnedBgScroll() {
    const bgVideo = document.querySelector('.pinned-bg-video');
    if (!bgVideo) return;

    bgVideo.muted = true;
    bgVideo.playsInline = true;
    bgVideo.loop = true;

    // Gentle continuous loop playing in the pinned background
    bgVideo.play().catch(() => {});

    let lastScrollY = window.scrollY;
    let targetPlaybackRate = 1.0;
    let currentPlaybackRate = 1.0;

    // React smoothly to scroll speed
    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      const delta = Math.abs(currentScrollY - lastScrollY);
      lastScrollY = currentScrollY;

      // Accelerate background video during scroll movement (like Horeca Social)
      targetPlaybackRate = Math.min(2.5, 1.0 + delta * 0.05);

      // Subtle parallax scale on background video
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? currentScrollY / maxScroll : 0;
      bgVideo.style.transform = `scale(${(1.02 + progress * 0.08).toFixed(3)})`;
    }, { passive: true });

    function smoothPlaybackLoop() {
      currentPlaybackRate += (targetPlaybackRate - currentPlaybackRate) * 0.1;
      targetPlaybackRate += (1.0 - targetPlaybackRate) * 0.05;
      
      if (bgVideo && !isNaN(currentPlaybackRate)) {
        bgVideo.playbackRate = Math.max(0.5, Math.min(2.5, currentPlaybackRate));
      }
      requestAnimationFrame(smoothPlaybackLoop);
    }
    smoothPlaybackLoop();
  }

  // 2. Modern 3D Physical Photo Frames (Tilt + Strict Hover Video Playback)
  function initPhotoFrames() {
    const frames = document.querySelectorAll('.photo-frame-modern');

    frames.forEach((frame) => {
      const video = frame.querySelector('.frame-video-stream');
      const glare = frame.querySelector('.frame-glass-sheen');
      const badgeText = frame.querySelector('.js-badge-text');

      if (video) {
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.pause(); // Strictly paused by default
      }

      // 3D Parallax Tilt on Mouse Move
      frame.addEventListener('mousemove', (e) => {
        const rect = frame.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        frame.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;

        if (glare) {
          const glareX = (x / rect.width) * 100;
          const glareY = (y / rect.height) * 100;
          glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.2) 0%, transparent 60%)`;
        }
      });

      frame.addEventListener('mouseleave', () => {
        frame.style.transform = `perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      });

      // Pointer Enter: Play Living Video
      frame.addEventListener('mouseenter', () => {
        frame.classList.add('is-playing');
        if (video) {
          video.play().catch(() => {});
        }
        if (badgeText) badgeText.textContent = 'PLAYING IN FULL HD';
      });

      // Pointer Leave: Pause Living Video & return to static photo
      frame.addEventListener('mouseleave', () => {
        frame.classList.remove('is-playing');
        if (video) {
          video.pause();
        }
        if (badgeText) badgeText.textContent = 'HOVER TO PLAY';
      });

      // Mobile Touch Tap: Toggle play
      frame.addEventListener('click', () => {
        const isPlaying = frame.classList.toggle('is-playing');
        if (video) {
          if (isPlaying) {
            video.play().catch(() => {});
            if (badgeText) badgeText.textContent = 'PLAYING IN FULL HD';
          } else {
            video.pause();
            if (badgeText) badgeText.textContent = 'TAP TO PLAY';
          }
        }
      });
    });
  }

  // 3. GSAP Parallax Floating Layers on Scroll
  function initParallaxFloat() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    // Staggered parallax float on portrait trio cards
    const portraitCards = document.querySelectorAll('.grid-3-portrait .gallery-card-item');
    portraitCards.forEach((card, index) => {
      const speeds = [-25, -45, -20];
      const yOffset = speeds[index % speeds.length];

      gsap.to(card, {
        yPercent: yOffset,
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.2
        }
      });
    });

    // Parallax on landscape duo
    const landscapeCards = document.querySelectorAll('.grid-2-landscape .gallery-card-item');
    landscapeCards.forEach((card, index) => {
      gsap.to(card, {
        yPercent: index === 0 ? -20 : -35,
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.2
        }
      });
    });
  }

  // 4. Mobile Menu Navigation
  function initNav() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('nav-menu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    menu.querySelectorAll('.nav-link').forEach((l) => {
      l.addEventListener('click', () => {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Document Ready
  document.addEventListener('DOMContentLoaded', () => {
    initPinnedBgScroll();
    initPhotoFrames();
    initParallaxFloat();
    initNav();
  });
})();
