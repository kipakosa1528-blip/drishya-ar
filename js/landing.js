/**
 * Kipakosa AR — Cinematic 3D Photo Frames & Ambient WebGL Stage Engine
 * Uses GSAP, Three.js, and Intersection Observers for 3D tilt, full-frame video awakening, and ambient depth.
 */

(function () {
  'use strict';

  // 1. Three.js Subtle Ambient Optical Dust & Light Particles
  function initThreeBg() {
    const canvas = document.getElementById('webgl-dust-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Particle geometry
    const particleCount = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const opacities = new Float32Array(particleCount);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 120;
      positions[i + 1] = (Math.random() - 0.5) * 80;
      positions[i + 2] = (Math.random() - 0.5) * 60;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Gold/amber dust material
    const material = new THREE.PointsMaterial({
      color: 0xe5a952,
      size: 1.4,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    let mouseX = 0;
    let mouseY = 0;

    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
    });

    function animate() {
      requestAnimationFrame(animate);
      particles.rotation.y += 0.0006;
      particles.rotation.x += 0.0003;

      camera.position.x += (mouseX - camera.position.x) * 0.03;
      camera.position.y += (-mouseY - camera.position.y) * 0.03;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // 2. 3D Physical Photo Frames Engine (Tilt + Full Video Playback)
  function initPhotoFrames() {
    const frames = document.querySelectorAll('.js-3d-frame');

    frames.forEach((frame) => {
      const card = frame.closest('.photo-frame-3d') || frame;
      const video = card.querySelector('.frame-live-video');
      const glare = card.querySelector('.frame-glass-glare');
      const statusText = card.querySelector('.js-frame-status');

      if (video) {
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
      }

      // 3D Parallax Tilt on Mouse Move
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;

        if (glare) {
          const glareX = (x / rect.width) * 100;
          const glareY = (y / rect.height) * 100;
          glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.22) 0%, transparent 60%)`;
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      });

      // Hover Interaction -> Plays Full Living Video
      card.addEventListener('mouseenter', () => {
        card.classList.add('is-alive');
        if (video) {
          video.play().catch(() => {});
        }
        if (statusText) statusText.textContent = 'LIVE WEBAR MOTION STREAMING';
      });

      card.addEventListener('mouseleave', () => {
        // If not forced by scroll observer, gently fade back
        if (!card.dataset.inView) {
          card.classList.remove('is-alive');
          if (statusText) statusText.textContent = 'HOVER / SCROLL TO AWAKEN';
        }
      });
    });

    // 3. Scroll-Triggered Video Awakening (Play on Scroll into View)
    if ('IntersectionObserver' in window) {
      const scrollObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const card = entry.target;
            const video = card.querySelector('.frame-live-video');
            const statusText = card.querySelector('.js-frame-status');

            if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
              card.dataset.inView = 'true';
              card.classList.add('is-alive');
              if (video) video.play().catch(() => {});
              if (statusText) statusText.textContent = 'LIVE WEBAR MOTION STREAMING';
            } else if (!entry.isIntersecting) {
              card.dataset.inView = '';
              card.classList.remove('is-alive');
              if (statusText) statusText.textContent = 'HOVER / SCROLL TO AWAKEN';
            }
          });
        },
        { threshold: [0.1, 0.4, 0.8] }
      );

      frames.forEach((f) => {
        const card = f.closest('.photo-frame-3d') || f;
        scrollObserver.observe(card);
      });
    }
  }

  // 4. Mobile Menu Navigation Toggle
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
    initThreeBg();
    initPhotoFrames();
    initNav();
  });
})();
