// Kipakosa landing — scroll-driven 3D living frame (Phase 1 foundation).
// One fixed canvas behind the page content. Loads after first paint, skips
// itself for reduced-motion / Save-Data / no-WebGL, pauses when not visible.
import {
  ACESFilmicToneMapping, DirectionalLight, Group, MathUtils, PerspectiveCamera,
  PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Lenis from 'lenis';

const MODEL_URL = '/assets/models/web/appu_frame.glb';
const FRAME_H = 0.598; // metres, matches assets/models/web/appu_frame.glb

const root = document.documentElement;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!navigator.connection?.saveData;
const coarse = matchMedia('(pointer: coarse)').matches;

if (reduceMotion || saveData || !webglAvailable()) {
  root.classList.add('scene3d-off');
} else {
  const start = () => init().catch((err) => {
    console.warn('[scene3d] disabled:', err);
    root.classList.add('scene3d-off');
  });
  const afterLoad = () => ('requestIdleCallback' in window
    ? requestIdleCallback(start, { timeout: 2500 })
    : setTimeout(start, 1200));
  if (document.readyState === 'complete') afterLoad();
  else addEventListener('load', afterLoad, { once: true });
}

function initSmoothScroll() {
  if (coarse) return; // keep native momentum scrolling on touch devices
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, anchors: true });
  if (window.gsap && window.ScrollTrigger) {
    lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add((t) => lenis.raf(t * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

async function init() {
  const canvas = document.createElement('canvas');
  canvas.id = 'scene3d';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new DirectionalLight(0xfff1dc, 1.6);
  key.position.set(1.5, 2, 2.5);
  scene.add(key);

  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 2.1);

  const rig = new Group();   // layout offset + scroll pose
  const bob = new Group();   // idle float + pointer tilt
  rig.add(bob);
  scene.add(rig);

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;
  model.position.y = -FRAME_H / 2; // pivot is at the base; centre it on the rig
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name === 'Photo') o.material.toneMapped = false; // keep the photo's true colours
    if (o.material.name === 'Glass') o.material.depthWrite = false;
  });
  bob.add(model);

  // ── Layout: desktop puts the frame right of the headline, phones low-centre ──
  let width = 0, height = 0;
  function resize() {
    width = innerWidth; height = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const visH = 2 * camera.position.z * Math.tan(MathUtils.degToRad(camera.fov / 2));
    const visW = visH * camera.aspect;
    if (camera.aspect > 1) {
      rig.position.set(visW * 0.3, 0, 0);
      rig.scale.setScalar(MathUtils.clamp(width / 1400, 0.65, 1));
    } else {
      rig.position.set(0, -visH * 0.2, 0);
      rig.scale.setScalar(Math.min(0.85, camera.aspect * 1.4));
    }
  }
  resize();
  addEventListener('resize', resize);

  // ── Input: scroll progress + pointer ──
  let scrollPos = window.scrollY;
  addEventListener('scroll', () => { scrollPos = window.scrollY; }, { passive: true });
  const pointer = { x: 0, y: 0 };
  if (!coarse) {
    addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  const pose = { rotY: -0.5, tiltX: 0, tiltY: 0, alpha: 0 };
  // Tiny clock (THREE.Clock is deprecated).
  const clock = {
    last: performance.now(), elapsedTime: 0,
    getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; },
  };
  const smoothstep = (a, b, v) => { const t = MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const heroFade = 1 - smoothstep(height * 0.5, height * 1.3, scrollPos);
    pose.alpha += (heroFade - pose.alpha) * Math.min(1, dt * 6);
    canvas.style.opacity = pose.alpha.toFixed(3);
    if (pose.alpha < 0.01) return; // frame is off-screen: skip the GPU work

    const progress = MathUtils.clamp(scrollPos / (height * 1.3), 0, 1);
    pose.rotY += ((-0.5 + progress * 1.6) - pose.rotY) * Math.min(1, dt * 4);
    pose.tiltX += (pointer.y * 0.12 - pose.tiltX) * Math.min(1, dt * 3);
    pose.tiltY += (pointer.x * 0.2 - pose.tiltY) * Math.min(1, dt * 3);

    rig.rotation.y = pose.rotY;
    bob.rotation.x = pose.tiltX;
    bob.rotation.y = pose.tiltY;
    bob.position.y = Math.sin(t * 0.9) * 0.012;
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
    if (!document.hidden) clock.getDelta();
  });

  initSmoothScroll();
  requestAnimationFrame(() => root.classList.add('scene3d-ready'));
}
