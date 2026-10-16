// Kipakosa landing — scroll-driven 3D living frame.
// One fixed canvas behind the page content. The frame docks onto real page
// elements ("stops"), so it follows the layout and the existing parallax.
// Loads after first paint, skips itself for reduced-motion / Save-Data /
// no-WebGL, and pauses when it is not visible.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Group, MathUtils, Mesh, MeshBasicMaterial,
  PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, TextureLoader, VideoTexture, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Lenis from 'lenis';

const MODEL_URL = '/assets/models/web/appu_frame.glb';
const FRAME_H = 0.598; // metres, matches assets/models/web/appu_frame.glb
const PLANE_ASPECT = 3.538 / 5; // photo plane width / height
const FRAME_ASPECT = 0.42 / 0.598; // whole frame width / height
const GLASS_TO_FRAME = 1.3; // CSS photo-area height -> full 3D frame height (moulding)
const OVERLAY_LIFT = 0.0006; // metres: video plane sits just in front of the photo

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

const smoothstep = (a, b, v) => { const t = MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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
  scene.environmentIntensity = 0.3; // the room map is bright; keep it as soft fill so colours stay rich
  const key = new DirectionalLight(0xfff1dc, 2.4);
  key.position.set(1.5, 2, 2.5);
  scene.add(key);

  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 2.1);

  const rig = new Group(); // docked position, scale and scroll pose
  const bob = new Group(); // idle float + pointer tilt
  rig.add(bob);
  scene.add(rig);

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;
  model.position.y = -FRAME_H / 2; // pivot is at the base; centre it on the rig
  let photo = null;
  let moulding = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name === 'Photo') { // unlit, so the photo keeps its true colours
      o.material = new MeshBasicMaterial({ map: o.material.map, toneMapped: false });
      photo = o;
    }
    if (o.material.name === 'Glass') o.material.depthWrite = false;
    if (o.material.name === 'Moulding_Walnut') moulding = o.material;
  });
  bob.add(model);

  // ── Photo layers: base = embedded Appu photo or story poster, overlay = video ──
  const appuMap = photo.material.map;
  const overlayMat = new MeshBasicMaterial({
    transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const overlay = new Mesh(photo.geometry, overlayMat);
  overlay.position.copy(photo.position);
  overlay.quaternion.copy(photo.quaternion);
  overlay.scale.copy(photo.scale);
  overlay.renderOrder = 1;
  photo.parent.add(overlay);
  overlay.translateY(OVERLAY_LIFT);

  // Fit a texture to the photo plane like CSS object-fit: cover.
  function cover(tex, w, h) {
    const r = w / h;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    if (r > PLANE_ASPECT) { tex.repeat.x = PLANE_ASPECT / r; tex.offset.x = (1 - tex.repeat.x) / 2; }
    else { tex.repeat.y = r / PLANE_ASPECT; tex.offset.y = (1 - tex.repeat.y) / 2; }
  }

  // Story media (poster still -> video "awakening"); loaded lazily.
  const story = { poster: null, video: null, videoTex: null, posterReady: false, requested: false };
  function loadStoryMedia() {
    if (story.requested) return;
    story.requested = true;
    story.video = document.querySelector('.hero-center-frame video');
    new TextureLoader().load('/assets/exhibition/swayambhu-spire-poster.jpg', (t) => {
      t.colorSpace = SRGBColorSpace;
      t.flipY = false;
      cover(t, t.image.width, t.image.height);
      story.poster = t;
      story.posterReady = true;
      if (shown?.s.id === 'story') applyContent(shown.s);
    });
    const v = story.video;
    if (!v) return;
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    const tex = new VideoTexture(v);
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    story.videoTex = tex;
    const fit = () => {
      if (!v.videoWidth) return;
      cover(tex, v.videoWidth, v.videoHeight);
      overlayMat.map = tex;
      overlayMat.needsUpdate = true;
    };
    v.addEventListener('loadedmetadata', fit);
    fit();
  }
  const playStoryVideo = () => { const v = story.video; if (v && v.paused) v.play().catch(() => {}); };
  const pauseStoryVideo = () => { const v = story.video; if (v && !v.paused) v.pause(); };

  // Moulding finishes (pricing cards swap these on hover).
  const FINISHES = {
    walnut: { color: new Color(0x331d0f), metalness: 0.0, roughness: 0.75, env: 0.1 },
    gold: { color: new Color(0xb5802a), metalness: 1.0, roughness: 0.42, env: 0.45 },
    onyx: { color: new Color(0x0d0d10), metalness: 0.3, roughness: 0.5, env: 0.25 },
  };
  moulding.color.copy(FINISHES.walnut.color);
  moulding.envMap = scene.environment; // own env so metal finishes can be lit independently
  moulding.envMapIntensity = FINISHES.walnut.env;
  let finishName = 'walnut';

  // ── Scroll stops: the frame docks onto real page elements ──
  let width = 0;
  let height = 0;
  let unit = 0; // world metres per CSS pixel at z = 0
  let scrollPos = window.scrollY;
  const scrollP = (r) => MathUtils.clamp((height - r.top) / (height + r.height), 0, 1); // 0 entering -> 1 leaving
  const desktop = () => width >= 1100;

  const STOPS = [
    { id: 'hero', sel: '.cinematic-cover-hero', enabled: () => true,
      place() {
        if (width > height) return { cx: width * 0.84, cy: height * 0.5, h: height * 0.5 * MathUtils.clamp(width / 1400, 0.65, 1) };
        return { cx: width / 2, cy: height * 0.7, h: height * 0.53 * Math.min(0.85, (width / height) * 1.4) };
      },
      pose: () => ({ rotY: -0.5 + MathUtils.clamp(scrollPos / (height * 1.3), 0, 1) * 1.6, tilt: 1 }) },
    { id: 'story', sel: '.story-frame-col .frame-glass', enabled: () => true,
      place: (r) => ({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: Math.min(r.height * GLASS_TO_FRAME, (width - 24) / FRAME_ASPECT) }),
      pose: (p) => ({ rotY: (0.5 - p) * 1.6, tilt: 0.3 }) },
    { id: 'scanner', sel: '#scanner .optical-visual-col', enabled: desktop,
      place: (r) => ({ cx: r.left + r.width * 0.6, cy: r.top + r.height * 0.4, h: MathUtils.clamp(r.height * 0.85, 260, height * 0.72) }),
      pose: (p) => ({ rotY: MathUtils.lerp(0.55, -1.25, p), tilt: 0.3 }) },
    { id: 'demo', sel: '#demo .editorial-section-intro', enabled: desktop,
      place(r) {
        const c = document.querySelector('#demo .container').getBoundingClientRect();
        const h = MathUtils.clamp(r.height * 1.5, 230, 330);
        return { cx: c.right - h * 0.42, cy: r.top + r.height / 2, h };
      },
      pose: (p) => ({ rotY: (0.5 - p) * 0.9, tilt: 0.6 }) },
    { id: 'pricing', sel: '#pricing .container > div:first-child', enabled: () => width >= 1180,
      place(r) {
        const h = 240;
        return { cx: width - 120, cy: r.top + r.height / 2, h };
      },
      pose: (p) => ({ rotY: (0.5 - p) * 0.7, tilt: 0.6 }) },
  ];
  const elCache = new Map();
  const rectOf = (sel) => {
    let el = elCache.get(sel);
    if (!el) { el = document.querySelector(sel); if (el) elCache.set(sel, el); }
    return el ? el.getBoundingClientRect() : null;
  };
  let shown = null; // { s: stop }

  function applyContent(stop) {
    const wantStory = stop.id === 'story' && story.posterReady;
    photo.material.map = wantStory ? story.poster : appuMap;
    photo.material.needsUpdate = true;
    if (stop.id !== 'story') overlayMat.opacity = 0;
    finishName = 'walnut';
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    unit = (2 * camera.position.z * Math.tan(MathUtils.degToRad(camera.fov / 2))) / height;
  }
  resize();
  addEventListener('resize', resize);

  // ── Input ──
  addEventListener('scroll', () => { scrollPos = window.scrollY; }, { passive: true });
  const pointer = { x: 0, y: 0 };
  if (!coarse) {
    addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
    const names = ['walnut', 'gold', 'onyx'];
    document.querySelectorAll('#pricing .ar-plan-card').forEach((card, i) => {
      card.addEventListener('pointerenter', () => { if (shown?.s.id === 'pricing') finishName = names[i] || 'walnut'; });
    });
    document.querySelector('#pricing .ar-plans-grid-3')?.addEventListener('pointerleave', () => { finishName = 'walnut'; });
  }

  const pose = { rotY: -0.5, tiltX: 0, tiltY: 0, alpha: 0 };
  const clock = {
    last: performance.now(),
    elapsedTime: 0,
    getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; },
  };

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Which stop is closest to the viewport centre?
    let best = null;
    let bestOff = Infinity;
    for (const s of STOPS) {
      if (!s.enabled()) continue;
      const r = rectOf(s.sel);
      if (!r || r.width < 2 || r.bottom < 0 || r.top > height) continue;
      const off = Math.abs(r.top + r.height / 2 - height / 2);
      if (off < bestOff) { best = s; bestOff = off; }
    }
    // Warm the story media a couple of screens early.
    const sr = rectOf('.story-frame-col .frame-glass');
    if (sr && sr.top < height * 3) loadStoryMedia();

    if (!shown && best) { shown = { s: best }; applyContent(best); }
    let target = 0;
    let layout = null;
    if (shown) {
      const r = rectOf(shown.s.sel);
      if (best && best !== shown.s) {
        if (pose.alpha < 0.04) { shown = { s: best }; applyContent(best); }
      } else if (r && shown.s.enabled()) {
        const off = Math.abs(r.top + r.height / 2 - height / 2);
        target = best === shown.s ? 1 - smoothstep(height * 0.32, height * 0.62, off) : 0;
        layout = { r, place: shown.s.place(r), pose: shown.s.pose(scrollP(r)) };
      }
    }
    pose.alpha += (target - pose.alpha) * Math.min(1, dt * 10);
    canvas.style.opacity = pose.alpha.toFixed(3);
    if (pose.alpha < 0.01 || !layout) { pauseStoryVideo(); return; } // off-screen: skip the GPU work

    // Dock the rig onto the anchor (screen px -> world).
    const { cx, cy, h } = layout.place;
    const scale = (h * unit) / FRAME_H;
    rig.position.set((cx - width / 2) * unit, -(cy - height / 2) * unit, 0);
    rig.scale.setScalar(scale);
    pose.rotY += (layout.pose.rotY - pose.rotY) * Math.min(1, dt * 6);
    const tiltAmt = layout.pose.tilt;
    pose.tiltX += (pointer.y * 0.12 * tiltAmt - pose.tiltX) * Math.min(1, dt * 3);
    pose.tiltY += (pointer.x * 0.2 * tiltAmt - pose.tiltY) * Math.min(1, dt * 3);
    rig.rotation.y = pose.rotY;
    bob.rotation.x = pose.tiltX;
    bob.rotation.y = pose.tiltY;
    bob.position.y = Math.sin(t * 0.9) * 0.012;

    // Story: still -> video awakening once the frame is centred.
    const isStory = shown.s.id === 'story' && !!story.videoTex && !!overlayMat.map;
    const wake = isStory ? smoothstep(0.38, 0.54, scrollP(layout.r)) : 0;
    overlayMat.opacity += (wake - overlayMat.opacity) * Math.min(1, dt * 5);
    if (isStory && wake > 0.02) playStoryVideo(); else pauseStoryVideo();

    // Moulding finish (smooth re-tint).
    const f = FINISHES[finishName];
    const k = Math.min(1, dt * 6);
    moulding.color.lerp(f.color, k);
    moulding.metalness += (f.metalness - moulding.metalness) * k;
    moulding.roughness += (f.roughness - moulding.roughness) * k;
    moulding.envMapIntensity += (f.env - moulding.envMapIntensity) * k;

    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
    if (!document.hidden) clock.getDelta();
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    root.classList.add('scene3d-off');
  });

  if (location.search.includes('debug3d')) window.__s3d = { model, moulding, photo, overlayMat, scene, renderer };

  initSmoothScroll();
  requestAnimationFrame(() => root.classList.add('scene3d-ready'));
}
