// Kipakosa landing — scroll-driven 3D living frame.
// One fixed canvas behind the page content. The frame travels down the page
// from empty space to empty space: it docks onto a "stop" (an element on the
// page), holds there while that section is on screen, then glides, scales and
// rotates to the next stop as you scroll. It never fades out on desktop.
// Loads after first paint, skips itself for reduced-motion / Save-Data /
// no-WebGL, and pauses when it is not visible.
import {
  ACESFilmicToneMapping, AdditiveBlending, BufferGeometry, CanvasTexture, DirectionalLight, Float32BufferAttribute,
  Group, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator, Points, PointsMaterial,
  Scene, SRGBColorSpace, TextureLoader, VideoTexture, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Lenis from 'lenis';

const MODEL_URL = '/assets/models/web/appu_frame.glb';
const FRAME_H = 0.598; // metres, matches assets/models/web/appu_frame.glb
const PLANE_ASPECT = 3.538 / 5; // photo plane width / height
const FRAME_ASPECT = 0.42 / 0.598; // whole frame width / height
const GLASS_TO_FRAME = 1.3; // CSS photo-area height -> full 3D frame height (moulding)
const OVERLAY_LIFT = 0.0006; // metres: dissolve/video plane sits just in front of the photo
const TAU = Math.PI * 2;
const HOVER_STOPS = new Set(['reels', 'works', 'scanner', 'magazines', 'pricing', 'faq']); // stages where hovering plays the Appu video
const MAX_H = 0.76; // a frame is never taller than this share of the screen

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
const shifted = (r, dy) => ({ top: r.top + dy, bottom: r.bottom + dy, left: r.left, right: r.right, width: r.width, height: r.height });

async function init() {
  const canvas = document.createElement('canvas');
  canvas.id = 'scene3d';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const key = new DirectionalLight(0xfff1dc, 1.8);
  key.position.set(1.5, 2, 2.5);
  scene.add(key);
  const rim = new DirectionalLight(0xa9c4ff, 1.1); // cool edge light from behind: catches the stone as the frame turns
  rim.position.set(-2, 1, -2);
  scene.add(rim);

  // Soft radial sprite used for the halo and the dust.
  function radialTexture(stops) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  }

  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 2.1);

  const rig = new Group(); // docked position, scale and scroll pose
  const bob = new Group(); // idle float + pointer tilt
  rig.add(bob);
  scene.add(rig);

  // Gold dust drifting in the air for depth; drifts with the scroll.
  const DUST = coarse ? 70 : 150;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i += 1) {
    dustPos[i * 3] = (Math.random() - 0.5) * 2.6;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new Float32BufferAttribute(dustPos, 3));
  const dust = new Points(dustGeo, new PointsMaterial({
    map: radialTexture([[0, 'rgba(255,225,160,1)'], [0.4, 'rgba(255,200,110,0.55)'], [1, 'rgba(255,190,100,0)']]),
    size: 0.032, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(dust);

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const template = gltf.scene;

  // One frame = the stone-and-glass model, an unlit photo layer, and an overlay layer for dissolves and video.
  function createFrame(parentBob, own = false) {
    const model = template.clone(true);
    model.position.y = -FRAME_H / 2; // pivot is at the base; centre it on its group
    let photo = null;
    const stone = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.name !== 'Photo') {
        if (own && !o.material.transmission) { o.material = o.material.clone(); stone.push(o.material); }
        return;
      }
      // Unlit, so the print keeps its true colours; the glass pane adds the sheen.
      o.material = new MeshBasicMaterial({ map: o.material.map, toneMapped: false });
      photo = o;
    });
    parentBob.add(model);
    const overlayMat = new MeshBasicMaterial({
      map: photo.material.map, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const overlay = new Mesh(photo.geometry, overlayMat);
    overlay.position.copy(photo.position);
    overlay.quaternion.copy(photo.quaternion);
    overlay.scale.copy(photo.scale);
    overlay.renderOrder = 1;
    photo.parent.add(overlay);
    overlay.translateY(OVERLAY_LIFT);
    // Dim the whole frame (used for ring cards that sit further back).
    const tint = (v) => { stone.forEach((m) => m.color.setScalar(v)); photo.material.color.setScalar(v); overlayMat.color.setScalar(v); };
    return { photo, overlayMat, appuMap: photo.material.map, tint };
  }
  const { photo, overlayMat, appuMap, tint: tintMain } = createFrame(bob, true);

  // Fit a texture to the photo plane like CSS object-fit: cover.
  function cover(tex, w, h) {
    const r = w / h;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    if (r > PLANE_ASPECT) { tex.repeat.x = PLANE_ASPECT / r; tex.offset.x = (1 - tex.repeat.x) / 2; }
    else { tex.repeat.y = r / PLANE_ASPECT; tex.offset.y = (1 - tex.repeat.y) / 2; }
  }

  // Story media (poster still -> video "awakening"); loaded lazily.
  const story = { poster: null, video: null, videoTex: null, requested: false };
  function loadStoryMedia() {
    if (story.requested) return;
    story.requested = true;
    story.video = document.querySelector('.hero-center-frame video');
    new TextureLoader().load('/assets/exhibition/swayambhu-spire-poster.jpg', (t) => {
      t.colorSpace = SRGBColorSpace;
      t.flipY = false;
      cover(t, t.image.width, t.image.height);
      story.poster = t;
    });
    const v = story.video;
    if (!v) return;
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    const tex = new VideoTexture(v);
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    const fit = () => { if (v.videoWidth) { cover(tex, v.videoWidth, v.videoHeight); story.videoTex = tex; } };
    v.addEventListener('loadedmetadata', fit);
    fit();
  }

  // The Appu project's own video: the frame's printed photo wakes into it (reels slot).
  const appuVid = { video: null, tex: null, requested: false };
  function loadAppuVideo() {
    if (appuVid.requested) return;
    appuVid.requested = true;
    const v = document.createElement('video');
    v.src = '/assets/exhibition/appu-living.mp4';
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', '');
    appuVid.video = v;
    const tex = new VideoTexture(v);
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    const fit = () => { if (v.videoWidth) { cover(tex, v.videoWidth, v.videoHeight); appuVid.tex = tex; } };
    v.addEventListener('loadedmetadata', fit);
    v.load();
  }
  const playAppuVideo = () => { const v = appuVid.video; if (v && v.paused) v.play().catch(() => {}); };
  const pauseAppuVideo = () => { const v = appuVid.video; if (v && !v.paused) v.pause(); };

  // The scan target from the demo section: the frame shows exactly this picture there.
  const demoImg = document.getElementById('landing-demo-target-display');
  const target = { tex: null, src: '' };
  function ensureTarget() {
    if (!demoImg) return;
    const src = demoImg.currentSrc || demoImg.src;
    if (!src || src === target.src) return;
    target.src = src;
    new TextureLoader().load(src, (t) => {
      t.colorSpace = SRGBColorSpace;
      t.flipY = false;
      cover(t, t.image.width, t.image.height);
      target.tex = t;
    });
  }

  const maps = () => ({ appu: appuMap, still: story.poster, video: story.videoTex, appuVideo: appuVid.tex, target: target.tex });
  let content = 'appu'; // what the photo currently shows (or is dissolving to)
  let pendingSwap = null; // base-layer swap to apply once the dissolve completes
  let overlayTarget = 0;

  function steerContent(wanted) {
    if (pendingSwap) return; // finish the current dissolve first
    const m = maps();
    if (wanted === 'video' && content === 'appu') wanted = 'still'; // always pass through the still
    if (wanted === 'appuVideo' && content !== 'appu' && content !== 'appuVideo') wanted = 'appu'; // wake from the Appu print
    if (content === 'appuVideo' && wanted !== 'appu' && wanted !== 'appuVideo') wanted = 'appu'; // and settle back to it first
    if (!m[wanted] || wanted === content) return;
    if (wanted === 'video' || wanted === 'appuVideo') {
      overlayMat.map = m[wanted];
      overlayTarget = 1;
    } else if (content === 'video' || content === 'appuVideo') {
      photo.material.map = m[wanted]; // video fades out over the new base
      overlayTarget = 0;
    } else {
      overlayMat.map = m[wanted];
      overlayTarget = 1;
      pendingSwap = wanted;
    }
    content = wanted;
  }

  // ── Stops: where the frame lives on the page ──
  let width = 0;
  let height = 0;
  let unit = 0; // world metres per CSS pixel at z = 0
  let scrollPos = window.scrollY;
  let clockT = 0; // seconds, for turntable stops
  let reelGrow = 1;
  let reelHover = false; // the frame in the reels row plays on hover, like the other four
  const wide = () => width >= 1100;
  const scrollP = (r) => MathUtils.clamp((height - r.top) / (height + r.height), 0, 1); // 0 entering -> 1 leaving
  const clampH = (v, lo, hi) => MathUtils.clamp(v, lo, hi);
  // pose(p): rotY / rotZ as the stop's element scrolls through the viewport
  const spin = (k, off, z = 0) => (p) => ({ rotY: (0.5 - p) * k + off, rotZ: z });

  const appuCard = document.querySelector('.moment-card[data-appu-frame]');
  const stagePlace = (r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: Math.min(r.height, (r.right - r.left + 16) / FRAME_ASPECT) });
  const STOPS = [
    { id: 'hero', sel: '.cinematic-cover-hero', enabled: () => true,
      place() {
        if (width > height) return { cx: width * 0.79, cy: height * 0.52, h: height * 0.62 * MathUtils.clamp(width / 1400, 0.7, 1.08) };
        return { cx: width / 2, cy: height * 0.7, h: height * 0.53 * Math.min(0.85, (width / height) * 1.4) };
      },
      pose: spin(2.6, -0.55) },
    { id: 'story', sel: '.story-frame-col .frame-glass', enabled: () => true,
      place: (r) => ({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: Math.min(r.height * GLASS_TO_FRAME, (width - 24) / FRAME_ASPECT, height * MAX_H) }),
      pose: spin(1.6, 0) },
    // The first of five slots in the reels row is left empty for the frame.
    { id: 'reels', sel: '.reel-stage', enabled: wide,
      place: (r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: Math.min(r.height, (r.right - r.left + 16) / FRAME_ASPECT) }),
      pose: spin(1.6, 0, 0.02) },
    // The frame joins the ring as one of its cards and moves round with the others.
    { id: 'exhibition', sel: '.moment-card[data-appu-frame]', enabled: wide,
      place: (r) => ({ cx: MathUtils.clamp((r.left + r.right) / 2, 80, width - 80), cy: (r.top + r.bottom) / 2, h: r.height }),
      pose: () => { const st = appuCard && appuCard.__rail; return { rotY: st ? (st.ry * Math.PI) / 180 : 0, rotZ: 0 }; },
      dim: () => { const st = appuCard && appuCard.__rail; return st ? st.o * st.b : 1; } },
    // The third piece in the Living Works row.
    { id: 'works', sel: '.work-stage', enabled: wide,
      place: (r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: Math.min(r.height, (r.right - r.left + 16) / FRAME_ASPECT) }),
      pose: spin(1.6, 0.15, -0.02) },
    // The second piece of the magazine spread.
    { id: 'magazines', sel: '.mag-stage', enabled: wide, place: stagePlace, pose: spin(1.6, 0.1, 0.02) },
    // The frame takes the phone's place beside the steps.
    { id: 'scanner', sel: '.scan-stage', enabled: wide,
      place: (r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: Math.min(r.height, (r.right - r.left + 16) / FRAME_ASPECT) }),
      pose: spin(1.8, -0.1, 0.02) },
    // Replaces the flat scan target. Held still and face-on so the picture on it stays scannable.
    { id: 'demo', sel: '.demo-stage', enabled: wide, calm: true,
      place: (r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: Math.min(r.height, (r.right - r.left + 16) / FRAME_ASPECT) }),
      pose: () => ({ rotY: 0, rotZ: 0 }) },
    // Beside the pricing copy, inside the container.
    { id: 'pricing', sel: '.pricing-stage', enabled: wide, place: stagePlace, pose: spin(1.3, -0.15, -0.02) },
    // Under the FAQ heading, in the sticky left column.
    { id: 'faq', sel: '.faq-stage', enabled: wide, place: stagePlace, pose: spin(1.3, 0.2, 0.02) },
    // Final home: the empty column under the footer tagline. It turns slowly like a display piece.
    { id: 'footer', sel: '.footer-stage', enabled: () => true, spinRate: 0.45,
      place: (r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: Math.min(r.height * 0.98, (r.width - 16) / FRAME_ASPECT) }),
      pose: spin(0.6, 0.2) },
  ];
  ['.reel-stage', '.work-stage', '.scan-stage', '.mag-stage', '.pricing-stage', '.faq-stage'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener('pointerenter', () => { reelHover = true; document.body.classList.add('cursor-hovered'); });
    el.addEventListener('pointerleave', () => { reelHover = false; document.body.classList.remove('cursor-hovered'); });
    el.addEventListener('click', () => { reelHover = !reelHover; }); // tap to play / pause on touch screens
  });
  // ── Reels row: the four video cards are rendered as the very same 3D frame, so all five match exactly.
  // The DOM cards stay (invisible) as hover targets; each frame sits over its card and shows its poster/video.
  const reelFrames = [...document.querySelectorAll('.tiktok-grid .photo-frame-modern, .works-row .photo-frame-modern, .mag-spread .photo-frame-modern')].map((card, i) => {
    const root = new Group();
    const holder = new Group();
    root.add(holder);
    root.visible = false;
    scene.add(root);
    return {
      ...createFrame(holder), root, bob: holder, card, i, grow: 1, tiltX: 0, tiltY: 0, requested: false, videoTex: null,
      video: card.querySelector('video'), posterEl: card.querySelector('.frame-photo-base'),
    };
  });
  // ── Exhibition ring: every other card is the same 3D frame too, laid out by the carousel's own numbers ──
  const railFrames = [...document.querySelectorAll('[data-moments-rail] .moment-card')]
    .filter((c) => c !== appuCard)
    .map((card, i) => {
      const root = new Group();
      const holder = new Group();
      root.add(holder);
      root.visible = false;
      scene.add(root);
      return {
        ...createFrame(holder, true), root, bob: holder, card, i, requested: false, videoTex: null,
        video: card.querySelector('video'), posterEl: card.querySelector('.moment-poster'),
      };
    });
  const elCache = new Map();
  const rectOf = (sel) => {
    let el = elCache.get(sel);
    if (!el) { el = document.querySelector(sel); if (el) elCache.set(sel, el); }
    return el ? el.getBoundingClientRect() : null;
  };

  // Where the frame should be for a stop whose element would sit at scroll `at`.
  function evalStop(entry, at, idx) {
    const r = shifted(entry.r, scrollPos - at);
    const pose = entry.s.pose(scrollP(r));
    // Each stop sits one full turn further round than the last, so every flight spins the frame all the way round.
    return { ...entry.s.place(r), ...pose, rotY: pose.rotY + idx * TAU, rate: entry.s.spinRate || 0, dim: entry.s.dim ? entry.s.dim() : 1, r };
  }

  // The frame's layout at the current scroll: hold on a stop, or travel between two.
  function layout() {
    const entries = [];
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - height);
    for (const s of STOPS) {
      if (!s.enabled()) continue;
      const r = rectOf(s.sel);
      if (!r || (r.width < 2 && r.height < 2)) continue;
      entries.push({ s, r, C: Math.min((r.top + r.bottom) / 2 + scrollPos - height / 2, maxScroll - 1) }); // scroll where it is centred (reachable)
    }
    if (!entries.length) return null;
    entries.sort((a, b) => a.C - b.C);

    const dwell = height * 0.18;
    const minLen = height * 0.4;
    const win = [];
    const fadeSeg = [];
    for (let i = 0; i < entries.length - 1; i += 1) {
      fadeSeg[i] = !wide() && entries[i + 1].C - entries[i].C > height * 2.5;
      if (fadeSeg[i]) {
        const mid = (entries[i].C + entries[i + 1].C) / 2;
        win.push([i > 0 ? Math.max(mid, win[i - 1][1]) : mid, mid]);
        continue;
      }
      let a = entries[i].C + dwell;
      let b = entries[i + 1].C - dwell;
      if (b - a < minLen) { const mid = (entries[i].C + entries[i + 1].C) / 2; a = mid - minLen / 2; b = mid + minLen / 2; }
      if (i > 0) a = Math.max(a, win[i - 1][1]);
      win.push([a, Math.max(b, a + 1)]);
    }

    let hold = 0;
    for (let i = 0; i < win.length; i += 1) {
      if (fadeSeg[i]) { if (scrollPos > win[i][1]) hold = i + 1; continue; }
      if (scrollPos > win[i][1]) hold = i + 1;
      else if (scrollPos >= win[i][0]) {
        // Travelling from stop i to stop i+1.
        const u = smoothstep(0, 1, (scrollPos - win[i][0]) / (win[i][1] - win[i][0]));
        const from = evalStop(entries[i], win[i][0], i);
        const to = evalStop(entries[i + 1], win[i][1], i + 1);
        const bell = Math.sin(Math.PI * u); // 0 at both ends, 1 mid-flight
        const side = i % 2 ? -1 : 1;
        const h = from.h * (to.h / from.h) ** u * (1 + 0.12 * bell); // gentle swell toward the viewer mid-flight
        const half = (h * FRAME_ASPECT) / 2 + 14;
        return {
          cx: MathUtils.clamp(MathUtils.lerp(from.cx, to.cx, u) + side * bell * width * 0.09, half, width - half), // curved path
          cy: MathUtils.lerp(from.cy, to.cy, u),
          h,
          rotY: MathUtils.lerp(from.rotY, to.rotY, u) + clockT * (from.rate * (1 - u) + to.rate * u),
          rotZ: MathUtils.lerp(from.rotZ, to.rotZ, u) + side * bell * 0.1,
          rotX: -side * bell * 0.3,
          stop: u < 0.5 ? entries[i] : entries[i + 1],
          dim: MathUtils.lerp(from.dim, to.dim, u),
          hold: false,
          entries,
        };
      }
    }
    const e = entries[hold];
    const ev = evalStop(e, scrollPos, hold);
    return { ...ev, rotY: ev.rotY + clockT * ev.rate, rotX: 0, stop: e, entries, hold: true };
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
  }

  function loadReelMedia(f) {
    f.requested = true;
    if (f.posterEl) {
      new TextureLoader().load(f.posterEl.currentSrc || f.posterEl.src, (t) => {
        t.colorSpace = SRGBColorSpace;
        t.flipY = false;
        cover(t, t.image.width, t.image.height);
        f.photo.material.map = t;
      });
    }
    const v = f.video;
    if (!v) return;
    const tex = new VideoTexture(v);
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    const fit = () => { if (v.videoWidth) { cover(tex, v.videoWidth, v.videoHeight); f.videoTex = tex; f.overlayMat.map = tex; } };
    v.addEventListener('loadedmetadata', fit);
    fit();
  }

  function updateReelFrames(t, dt) {
    for (const f of reelFrames) {
      const r = f.card.getBoundingClientRect();
      const visible = wide() && r.width > 2 && r.bottom > -150 && r.top < height + 150;
      f.root.visible = visible;
      if (!visible) continue;
      if (!f.requested) loadReelMedia(f);
      const hovered = f.card.matches(':hover');
      f.grow += ((hovered ? 1.05 : 1) - f.grow) * Math.min(1, dt * 8);
      const h = Math.min(r.height, (r.width + 16) / FRAME_ASPECT) * f.grow;
      f.root.position.set(((r.left + r.right) / 2 - width / 2) * unit, -((r.top + r.bottom) / 2 - height / 2) * unit, 0);
      f.root.scale.setScalar((h * unit) / FRAME_H);
      const boost = hovered ? 1.6 : 1;
      f.tiltX += (pointer.y * 0.18 * boost - f.tiltX) * Math.min(1, dt * 3);
      f.tiltY += (pointer.x * 0.3 * boost - f.tiltY) * Math.min(1, dt * 3);
      f.bob.rotation.x = f.tiltX;
      f.bob.rotation.y = f.tiltY + Math.sin(t * 0.65 + f.i * 0.9) * 0.16; // same slow sway as the docked frame
      f.bob.position.y = Math.sin(t * 0.9 + f.i) * 0.014;
      // The page's own hover code plays/pauses the card video; the frame shows it while it plays.
      const playing = !!f.video && !f.video.paused && f.video.readyState >= 2 && !!f.videoTex;
      f.overlayMat.opacity += ((playing ? 1 : 0) - f.overlayMat.opacity) * Math.min(1, dt * 8);
    }
  }

  function updateRailFrames(t, dt) {
    for (const f of railFrames) {
      const st = f.card.__rail;
      const r = f.card.getBoundingClientRect();
      const dim = st ? st.o * st.b : 0;
      const visible = wide() && !!st && dim > 0.02 && r.width > 2 && r.bottom > -150 && r.top < height + 150;
      f.root.visible = visible;
      if (!visible) continue;
      if (!f.requested) loadReelMedia(f);
      f.tint(dim);
      f.root.position.set(((r.left + r.right) / 2 - width / 2) * unit, -((r.top + r.bottom) / 2 - height / 2) * unit, -st.abs * 0.03);
      f.root.scale.setScalar((r.height * unit) / FRAME_H);
      f.root.rotation.y = (st.ry * Math.PI) / 180;
      f.bob.rotation.x = pointer.y * 0.06;
      f.bob.rotation.y = pointer.x * 0.1 + Math.sin(t * 0.65 + f.i * 0.9) * 0.05;
      f.bob.position.y = Math.sin(t * 0.9 + f.i) * 0.012;
      const playing = !!f.video && !f.video.paused && f.video.readyState >= 2 && !!f.videoTex;
      f.overlayMat.opacity += ((playing ? 1 : 0) - f.overlayMat.opacity) * Math.min(1, dt * 8);
    }
  }

  let calm = 1; // 0 on stops that must stay still (the scan target)
  const pose = { rotY: -0.5, rotX: 0, rotZ: 0, tiltX: 0, tiltY: 0, alpha: 1 };
  const clock = {
    last: performance.now(),
    elapsedTime: 0,
    getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; },
  };

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    clockT = t;

    const sr = rectOf('.story-frame-col .frame-glass');
    if (sr && sr.top < height * 3) loadStoryMedia(); // warm the story media a couple of screens early
    const rr = rectOf('.reel-stage');
    if (rr && rr.top < height * 3) loadAppuVideo();
    const dr = rectOf('.demo-stage');
    if (dr && dr.top < height * 3) ensureTarget();

    const L = layout();
    if (!L) return;

    // On phones there is no empty space past the story, so the frame leaves after it.
    let alpha = 1;
    if (!wide() && L.hold) {
      const off = Math.abs(L.r.top + L.r.height / 2 - height / 2);
      alpha = 1 - smoothstep(height * 0.32, height * 0.62, off);
    }
    pose.alpha += (alpha - pose.alpha) * Math.min(1, dt * 10);
    canvas.style.opacity = wide() ? '' : pose.alpha.toFixed(3);
    if (pose.alpha < 0.01) { pauseAppuVideo(); return; }

    rig.position.set((L.cx - width / 2) * unit, -(L.cy - height / 2) * unit, 0);
    tintMain(L.dim);
    rig.visible = L.dim > 0.02;
    reelGrow += ((reelHover && HOVER_STOPS.has(L.stop.s.id) ? 1.05 : 1) - reelGrow) * Math.min(1, dt * 8);
    rig.scale.setScalar(((Math.min(L.h, height * MAX_H) * unit) / FRAME_H) * reelGrow);
    const k = Math.min(1, dt * 8);
    // If the layout renumbered the stops, jump by whole turns instead of spinning back.
    pose.rotY += TAU * Math.round((L.rotY - pose.rotY) / TAU);
    pose.rotY += (L.rotY - pose.rotY) * k;
    pose.rotX += (L.rotX - pose.rotX) * k;
    pose.rotZ += (L.rotZ - pose.rotZ) * k;
    calm += ((L.stop.s.calm ? 0 : 1) - calm) * Math.min(1, dt * 6);
    pose.tiltX += (pointer.y * 0.18 * calm - pose.tiltX) * Math.min(1, dt * 3);
    pose.tiltY += (pointer.x * 0.3 * calm - pose.tiltY) * Math.min(1, dt * 3);
    rig.rotation.y = pose.rotY;
    rig.rotation.x = pose.rotX;
    rig.rotation.z = pose.rotZ;
    bob.rotation.x = pose.tiltX;
    bob.rotation.y = pose.tiltY + Math.sin(t * 0.65) * 0.16 * calm; // never fully still: a slow sway while resting
    bob.position.y = Math.sin(t * 0.9) * 0.014 * calm;

    // Atmosphere: dust drifts with the scroll, the edge light glides as you scroll.
    dust.position.y = ((scrollPos * 0.00045) % 1.6) - 0.8 + Math.sin(t * 0.3) * 0.05;
    dust.rotation.y = t * 0.03 + scrollPos * 0.0004;
    key.position.x = 1.5 + Math.sin(t * 0.4 + scrollPos * 0.0015) * 1.3;
    rim.position.x = -2 + Math.cos(scrollPos * 0.002) * 1.2;

    // Photo: Appu print by default; in the story section it shows the story still, then wakes into video.
    const onStory = L.stop.s.id === 'story';
    let want = 'appu';
    if (L.stop.s.id === 'demo') want = 'target';
    else if (onStory) want = story.video && !story.video.paused ? 'video' : 'still'; // wakes on hover, like the others
    else if (HOVER_STOPS.has(L.stop.s.id) && reelHover) want = 'appuVideo';
    else if (L.stop.s.id === 'exhibition' && appuCard && appuCard.classList.contains('is-front')) want = 'appuVideo';
    steerContent(want);
    overlayMat.opacity += (overlayTarget - overlayMat.opacity) * Math.min(1, dt * 7);
    if (pendingSwap && overlayMat.opacity > 0.97) {
      photo.material.map = maps()[pendingSwap];
      pendingSwap = null;
      overlayMat.opacity = 0;
      overlayTarget = 0;
    }
    if (content === 'appuVideo' && overlayMat.opacity > 0.02) playAppuVideo(); else pauseAppuVideo();

    updateReelFrames(t, dt);
    updateRailFrames(t, dt);
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

  if (location.search.includes('debug3d')) window.__s3d = { model, photo, overlayMat, scene, renderer, layout };

  initSmoothScroll();
  requestAnimationFrame(() => root.classList.add('scene3d-ready'));
}
