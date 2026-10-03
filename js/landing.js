/**
 * Kipakosa — High-Fashion Cinematic Architecture
 * Clean opening cover hero · Scroll-driven mountain video · Hover-only living frames & phone video
 */

(function () {
  'use strict';

  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ─────────────────────────────────────────
     1. MINIMAL GEOMETRIC CURSOR
  ───────────────────────────────────────── */
  function initCursor() {
    const dot  = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let isVisible = false;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!isVisible) {
        rx = mx;
        ry = my;
        isVisible = true;
      }
      dot.style.left = mx + 'px';
      dot.style.top  = my + 'px';
    });

    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';
      requestAnimationFrame(loop);
    })();

    const interactiveEls = 'a, button, .photo-frame-modern, .editorial-frame, .hud-monolith-phone, .btn-luxury-gold, .btn-luxury-hollow';
    document.querySelectorAll(interactiveEls).forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hovered'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hovered'));
    });
  }

  /* ─────────────────────────────────────────
     2. FLOATING HEADER & DRAWER
  ───────────────────────────────────────── */
  function initHeader() {
    const toggle = document.getElementById('mobile-toggle');
    const drawer = document.getElementById('mobile-drawer');

    if (toggle && drawer) {
      toggle.addEventListener('click', () => {
        const isOpen = drawer.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
      drawer.querySelectorAll('.drawer-link').forEach(link => {
        link.addEventListener('click', () => {
          drawer.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* ─────────────────────────────────────────
     3. CINEMATIC COVER HERO REVEAL (Inside-out organic blossom)
  ───────────────────────────────────────── */
  function initHeroReveal() {
    if (typeof gsap === 'undefined') return;

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Inside-out aperture / smoke bloom expansion
    tl.to('.pinned-bg-stage', {
      clipPath: 'circle(130% at 50% 50%)',
      webkitClipPath: 'circle(130% at 50% 50%)',
      filter: 'blur(0px) brightness(1)',
      scale: 1,
      duration: 2.4,
      ease: 'power3.inOut'
    }, 0);

    // Title blooms from center with gentle de-blur
    tl.fromTo('.cover-monolith-title',
      { y: 60, opacity: 0, scale: 0.92, filter: 'blur(12px)' },
      { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.8, ease: 'power4.out' },
      0.35
    );

    tl.fromTo('.cover-eyebrow, .cover-tagline, .cover-scroll-indicator',
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 1.1, stagger: 0.15, ease: 'power3.out' },
      0.75
    );
  }

  /* ─────────────────────────────────────────
     4. HOVER-ONLY VIDEO AWAKENING (Frames + Mobile Phone Screen)
  ───────────────────────────────────────── */
  function initHoverLivingMedia() {
    const selectors = '.editorial-frame, .photo-frame-modern, .hud-monolith-phone';

    document.querySelectorAll(selectors).forEach(target => {
      const video = target.querySelector('video');
      const sheen = target.querySelector('.frame-sheen-layer');

      if (video) {
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.pause(); // Strictly paused
      }

      // 3D Tilt on Mousemove
      target.addEventListener('mousemove', (e) => {
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cx = rect.width  / 2;
        const cy = rect.height / 2;
        const rx = ((y - cy) / cy) * -8;
        const ry = ((x - cx) / cx) *  8;

        target.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(1.03, 1.03, 1.03)`;

        if (sheen) {
          const gx = (x / rect.width)  * 100;
          const gy = (y / rect.height) * 100;
          sheen.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.16) 0%, transparent 60%)`;
        }
      });

      target.addEventListener('mouseleave', () => {
        target.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        if (sheen) sheen.style.background = 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08) 0%, transparent 65%)';
        target.classList.remove('is-playing');
        if (video) video.pause();
      });

      // Desktop hover
      target.addEventListener('mouseenter', () => {
        if (!window.matchMedia('(pointer: coarse)').matches) {
          target.classList.add('is-playing');
          if (video) video.play().catch(() => {});
        }
      });

      // Tap toggle for touchscreens & mobile
      target.addEventListener('click', () => {
        const isNowPlaying = !target.classList.contains('is-playing');

        // On mobile / touch screens, pause other playing cards
        if (window.matchMedia('(pointer: coarse)').matches) {
          document.querySelectorAll(selectors).forEach(other => {
            if (other !== target && other.classList.contains('is-playing')) {
              other.classList.remove('is-playing');
              const otherVid = other.querySelector('video');
              if (otherVid) otherVid.pause();
            }
          });
        }

        if (isNowPlaying) {
          target.classList.add('is-playing');
          if (video) video.play().catch(() => {});
        } else {
          target.classList.remove('is-playing');
          if (video) video.pause();
        }
      });
    });
  }

  /* ─────────────────────────────────────────
     5. BACKGROUND VIDEO: PLAYS ON SCROLL
  ───────────────────────────────────────── */
  function initBgVideoScroll() {
    const bgVideo = document.querySelector('.pinned-bg-video');
    if (!bgVideo) return;

    bgVideo.muted = true;
    bgVideo.playsInline = true;
    bgVideo.loop = true;
    bgVideo.pause();

    let isScrollingTimer;
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
      const sy = window.scrollY;
      const delta = Math.abs(sy - lastScrollY);
      lastScrollY = sy;

      if (bgVideo.paused) {
        bgVideo.play().catch(() => {});
      }

      const speed = Math.min(3.0, 1.0 + delta * 0.05);
      bgVideo.playbackRate = speed;

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress  = maxScroll > 0 ? sy / maxScroll : 0;
      bgVideo.style.transform = `scale(${(1.02 + progress * 0.08).toFixed(3)}) translateY(${(progress * 35).toFixed(1)}px)`;

      clearTimeout(isScrollingTimer);
      isScrollingTimer = setTimeout(() => {
        bgVideo.pause();
      }, 160);
    }, { passive: true });
  }

  /* ─────────────────────────────────────────
     6. CONTINUOUS MULTI-PLANE SCROLL PARALLAX
  ───────────────────────────────────────── */
  function initContinuousParallax() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    // ── Cover Hero dissolves and Background Video Fades to Backdrop ──
    gsap.to('.cover-hero-center', {
      y: -100,
      opacity: 0.05,
      scale: 0.92,
      ease: 'none',
      scrollTrigger: {
        trigger: '.cinematic-cover-hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    gsap.to('.pinned-bg-video', {
      opacity: 0.22,
      filter: 'brightness(0.55) contrast(1.15) saturate(1.05)',
      ease: 'none',
      scrollTrigger: {
        trigger: '.cinematic-cover-hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    gsap.to('.pinned-bg-overlay', {
      opacity: 0.95,
      ease: 'none',
      scrollTrigger: {
        trigger: '.cinematic-cover-hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    // ── Hero Story Content Emerges ──
    gsap.to('.story-text-col', {
      y: -40,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero-story-section',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.2
      }
    });

    gsap.to('.story-frame-col', {
      y: -80,
      scale: 1.03,
      rotateZ: -1.5,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero-story-section',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.4
      }
    });

    // ── Living Works Asymmetrical Parallax ──
    const duoMedia = document.querySelector('.duo-media-col');
    const duoQuote = document.querySelector('.duo-statement-col');
    const panoLeft = document.querySelector('.panorama-col-large');
    const panoRight = document.querySelector('.panorama-col-offset');

    if (duoMedia) {
      gsap.to(duoMedia, {
        y: -70,
        ease: 'none',
        scrollTrigger: {
          trigger: '.gallery-hero-duo',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.4
        }
      });
    }
    if (duoQuote) {
      gsap.to(duoQuote, {
        y: 50,
        ease: 'none',
        scrollTrigger: {
          trigger: '.gallery-hero-duo',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.4
        }
      });
    }
    if (panoLeft) {
      gsap.to(panoLeft, {
        y: -45,
        x: -16,
        ease: 'none',
        scrollTrigger: {
          trigger: '.gallery-panoramas-row',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.3
        }
      });
    }
    if (panoRight) {
      gsap.to(panoRight, {
        y: 45,
        x: 16,
        ease: 'none',
        scrollTrigger: {
          trigger: '.gallery-panoramas-row',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.3
        }
      });
    }

    // ── Scanner Monolith Phone Float ──
    const hudPhone = document.querySelector('.hud-monolith-phone');
    if (hudPhone) {
      gsap.to(hudPhone, {
        y: -80,
        rotateY: -6,
        rotateX: 4,
        scale: 1.04,
        ease: 'none',
        scrollTrigger: {
          trigger: '.optical-stage-section',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.4
        }
      });
    }

    // ── Manifesto Quote ──
    const manifesto = document.querySelector('.manifesto-huge-quote');
    if (manifesto) {
      gsap.to(manifesto, {
        scale: 1.02,
        y: -20,
        ease: 'none',
        scrollTrigger: {
          trigger: '.manifesto-section',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.2
        }
      });
    }
  }

  /* ─────────────────────────────────────────
     8. MAGNETIC BUTTONS
  ───────────────────────────────────────── */
  function initMagneticButtons() {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    document.querySelectorAll('.magnetic-btn').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const dx = e.clientX - rect.left - rect.width  / 2;
        const dy = e.clientY - rect.top  - rect.height / 2;
        btn.style.transform = `translate3d(${dx * 0.25}px, ${dy * 0.25}px, 0)`;
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        btn.style.transform = 'translate3d(0, 0, 0)';
        setTimeout(() => { btn.style.transition = ''; }, 400);
      });
    });
  }

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initCursor();
    initHeader();
    initHeroReveal();
    initHoverLivingMedia();
    initBgVideoScroll();
    initContinuousParallax();
    initMagneticButtons();

    setTimeout(() => {
      ScrollTrigger.refresh();
    }, 300);
  });

})();

