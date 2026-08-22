// Shader CTA borders — one shared WebGL renderer animates a portal/plasma
// flow inside every .shader-cta button's border band. Pointer-reactive.
// Fallbacks: reduced motion or no WebGL => static CSS conic-gradient class.

(function () {
  'use strict';

  const buttons = Array.from(document.querySelectorAll('.shader-cta'));
  if (!buttons.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    buttons.forEach(b => b.classList.add('shader-static'));
    return;
  }

  const VERT = `
    attribute vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }
  `;
  const FRAG = `
    precision mediump float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;   // 0..1 within button
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      vec2 p = uv * vec2(aspect, 1.0);
      float t = uTime * 0.4;

      float n = noise(p * 3.5 + t) + 0.5 * noise(p * 7.0 - t * 1.4);
      n *= 0.667;

      float md = distance(vec2(uv.x * aspect, uv.y), vec2(uMouse.x * aspect, uMouse.y));
      n += 0.30 * exp(-md * 5.0) * (0.6 + 0.4 * sin(t * 2.0));

      // border band mask
      float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float ring = smoothstep(0.015, 0.055, edge) * (1.0 - smoothstep(0.075, 0.34, edge));

      vec3 gold   = vec3(0.788, 0.663, 0.431); // #C9A96E
      vec3 ember  = vec3(0.949, 0.455, 0.212);
      vec3 deep   = vec3(0.102, 0.086, 0.062);
      vec3 col = mix(gold, ember, smoothstep(0.25, 0.85, n));
      col += deep * (1.0 - ring);

      gl_FragColor = vec4(col * ring * (0.55 + 0.65 * n), ring);
    }
  `;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  let glShared = null;       // first successful context becomes the template
  const instances = [];

  buttons.forEach(btn => {
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.className = 'shader-cta-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    btn.prepend(canvas);

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!gl) { btn.classList.add('shader-static'); canvas.remove(); return; }

    if (!glShared) glShared = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      btn.classList.add('shader-static');
      canvas.remove();
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const locP = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(locP);
    gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');

    const inst = {
      btn, canvas, gl, prog, uRes, uTime, uMouse,
      w: 0, h: 0, mx: 0.5, my: 0.5, tmx: 0.5, tmy: 0.5,
      visible: false, hover: false,
    };
    instances.push(inst);

    function resizeInst() {
      const r = btn.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pad = 12; // matches CSS inset:-6px on both axes
      inst.w = Math.max(2, Math.round((r.width + pad) * dpr));
      inst.h = Math.max(2, Math.round((r.height + pad) * dpr));
      canvas.width = inst.w; canvas.height = inst.h;
    }
    inst.resize = resizeInst;
    resizeInst();

    btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      inst.tmx = (e.clientX - r.left) / r.width;
      inst.tmy = 1 - (e.clientY - r.top) / r.height;
    });

    btn.addEventListener('click', () => {
      // subtle pulse on click
      inst.pulse = performance.now();
    });

    new IntersectionObserver(entries => {
      inst.visible = entries[0].isIntersecting;
    }, { rootMargin: '80px' }).observe(btn);
  });

  if (!instances.some(i => i.gl)) return; // all failed -> CSS fallback

  window.addEventListener('resize', () => instances.forEach(i => i.resize()));

  function frame(now) {
    const t = now / 1000;

    for (const it of instances) {
      if (!it.visible || !it.w) continue;
      it.mx += (it.tmx - it.mx) * 0.08;
      it.my += (it.tmy - it.my) * 0.08;
      const gl = it.gl;
      gl.viewport(0, 0, it.w, it.h);
      gl.useProgram(it.prog);
      gl.uniform2f(it.uRes, it.w, it.h);
      gl.uniform1f(it.uTime, t);
      gl.uniform2f(it.uMouse, it.mx, it.my);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();



