// Server-rendered 8th Wall AR viewer page.
// All user-derived values MUST be passed through esc()/jsonForScript() here.

import { esc, jsonForScript } from '../lib/security.js';

const SHELL_BG = 'font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#090d16;color:#fff';

/** Minimal styled message page (expired, limit reached, not found...). */
export function renderMessagePage({ icon = '', color = '#38bdf8', title = '', body = '' }) {
  return `<!DOCTYPE html><html><body style="${SHELL_BG}">
    <div style="max-width:400px;margin:0 auto;background:#162032;padding:32px 24px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 30px rgba(0,0,0,0.5)">
      <div style="font-size:44px;margin-bottom:12px">${esc(icon)}</div>
      <h2 style="color:${esc(color)};margin:0 0 10px;font-size:22px;font-weight:700">${esc(title)}</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6">${body}</p>
    </div></body></html>`;
}

/**
 * Render the full-screen AR experience for a project.
 * @param {object} p
 * @param {string} p.name project display name
 * @param {string} p.videoUrl absolute video URL
 * @param {string} p.muxPlaybackId optional Mux stream ID
 * @param {string} p.r2VideoUrl optional fallback R2 URL
 * @param {object} p.targetData 8th Wall target descriptor
 * @param {number} p.planeW rendered plane width
 * @param {number} p.planeH rendered plane height
 * @param {number} p.tW target image width in px
 * @param {number} p.tH target image height in px
 */
export function renderArPage({ name, videoUrl, muxPlaybackId, r2VideoUrl, targetData, planeW, planeH, tW, tH }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${esc(name)} - Kipakosa AR</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg?v=1">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png?v=1">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v=1">
  <!-- Preconnect to Mux CDN so TCP+TLS is ready before the video element is parsed -->
  <link rel="preconnect" href="https://stream.mux.com" crossorigin>
  <link rel="dns-prefetch" href="https://stream.mux.com">
  <!-- Preload video at highest priority so buffering starts during HTML parse -->
  <link rel="preload" as="video" href="${esc(videoUrl)}" crossorigin="anonymous">
  <!-- 8frame must be synchronous: it registers <a-scene>/<a-entity> custom elements
       that must be defined before the browser parses the body -->
  <script crossorigin="anonymous" src="/external/8frame-1.5.0.min.js"></script>
  <script src="/external/xr/xr.js" async crossorigin="anonymous" data-preload-chunks="slam"></script>
  <!-- Self-hosted xrextras (was jsDelivr CDN — eliminates external DNS+TLS hop) -->
  <script defer src="/external/xrextras.js" crossorigin="anonymous"></script>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; touch-action:none; background:transparent; }
    .a-enter-vr, .a-enter-vr-button { display:none !important; }

    /* Remove and suppress all 8th Wall branding & Powered-by logos */
    .poweredby,
    .powered-by,
    .poweredby-8thwall,
    .xrextras-powered-by,
    .xrextras-loading-footer,
    .loading-footer,
    #poweredBy8thWall,
    #poweredby,
    #loading-footer,
    img[src*="powered-by"],
    img[src*="8thwall"],
    [id*="poweredBy" i],
    [class*="poweredBy" i],
    [class*="powered-by" i],
    .xrextras-loading-footer img,
    .loading-footer img {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      left: -9999px !important;
    }

    /* Elegant Holographic Watermark */
    #ar-watermark {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(9, 13, 22, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 6px 14px 6px 8px;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    #ar-watermark img {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      display: block;
    }

    #ar-watermark span {
      color: #f8fafc;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    #ar-watermark span span {
      color: #38bdf8;
      font-size: 10px;
      font-weight: 800;
      margin-left: 2px;
    }

    /* Scanning guide overlay */
    #scan-overlay {
      position: fixed; inset: 0; z-index: 500;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      pointer-events: none;
      transition: opacity 0.5s ease;
    }
    #scan-overlay.hidden { opacity: 0; pointer-events: none; }
    .scan-reticle {
      width: 220px; height: 220px;
      border: 2px solid rgba(255,255,255,0.65);
      border-radius: 20px;
      box-shadow: 0 0 0 4px rgba(56,189,248,0.3);
      animation: scan-pulse 2s ease-in-out infinite;
    }
    @keyframes scan-pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(56,189,248,0.3); }
      50% { box-shadow: 0 0 0 14px rgba(56,189,248,0.0); }
    }
    .scan-hint {
      margin-top: 20px;
      color: rgba(255,255,255,0.9);
      font-size: 14px; font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif;
      text-shadow: 0 1px 4px rgba(0,0,0,0.6);
      letter-spacing: 0.02em;
    }

    /* Floating audio + replay pill */
    #ar-controls {
      position: fixed; bottom: 36px; left: 50%; transform: translateX(-50%);
      z-index: 9999; display: none; align-items: center; gap: 8px;
      background: rgba(9, 13, 22, 0.78);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      padding: 10px 18px; border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 4px 24px rgba(0,0,0,0.45);
      font-family: system-ui, -apple-system, sans-serif;
    }
    #ar-controls button {
      background: none; border: none; cursor: pointer;
      color: #f8fafc; font-size: 20px; padding: 4px 10px;
      border-radius: 8px; transition: background 0.15s;
      -webkit-tap-highlight-color: transparent;
    }
    #ar-controls button:active { background: rgba(255,255,255,0.15); }
  </style>
</head>
<body>
  <!-- Watermark Badge -->
  <div id="ar-watermark">
    <img src="/assets/logo.svg" alt="Logo" />
    <span>Kipakosa<span>AR</span></span>
  </div>

  <!-- Scanning guide: shows while camera is searching for target -->
  <div id="scan-overlay">
    <div class="scan-reticle"></div>
    <p class="scan-hint">Point camera at the photo</p>
  </div>

  <!-- Floating replay control: shown after target is found -->
  <div id="ar-controls">
    <button id="btn-replay" title="Replay from start">↩ Replay</button>
  </div>

  <script>
    var targetData = ${jsonForScript(targetData)};
    var onxrloaded = function() {
      XR8.XrController.configure({ imageTargetData: [targetData] });
    };
    window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded);
  </script>

  <a-scene xrextras-loading xrextras-runtime-error
    renderer="colorManagement:true;alpha:true;antialias:true"
    xrweb="allowedDevices: any; disableWorldTracking: true; disableDefaultEnvironment: true">
    <a-assets>
      <video id="ar-video" src="${esc(videoUrl)}"
        preload="auto" loop playsinline webkit-playsinline crossorigin="anonymous" muted autoplay>
      </video>
    </a-assets>
    <a-camera position="0 0 0"></a-camera>
    <xrextras-named-image-target name="target0">
      <a-plane id="ar-plane" width="${Number(planeW)}" height="${Number(planeH)}" position="0 0 0.01" visible="false"
        material="src: #ar-video; transparent: true; alphaTest: 0.01; shader: flat; side: double">
      </a-plane>
    </xrextras-named-image-target>
  </a-scene>

  <script>
    var video = document.getElementById('ar-video');
    var plane = document.getElementById('ar-plane');

    function updatePlaneMapping() {
      if (!video || !plane) return;
      var tW = Number(${Number(tW)}) || 640;
      var tH = Number(${Number(tH)}) || 640;
      var tAspect = tW / tH;
      var vW = video.videoWidth || tW;
      var vH = video.videoHeight || tH;
      var vAspect = (vW && vH) ? (vW / vH) : tAspect;

      // Plane size matches target aspect ratio
      if (tAspect >= 1) {
        plane.setAttribute('width', 1);
        plane.setAttribute('height', Number((1 / tAspect).toFixed(4)));
      } else {
        plane.setAttribute('width', Number(tAspect.toFixed(4)));
        plane.setAttribute('height', 1);
      }

      var repX = 1, repY = 1, offX = 0, offY = 0;
      if (vAspect > tAspect) {
        repX = Number((tAspect / vAspect).toFixed(4));
        offX = Number(((1 - repX) / 2).toFixed(4));
      } else if (vAspect < tAspect) {
        repY = Number((vAspect / tAspect).toFixed(4));
        offY = Number(((1 - repY) / 2).toFixed(4));
      }

      // Safe Three.js direct material texture update - zero A-Frame parser errors
      function applyTextureTransform() {
        try {
          var mesh = plane.getObject3D('mesh');
          if (mesh && mesh.material) {
            var mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            if (mat && mat.map) {
              mat.map.repeat.set(repX, repY);
              mat.map.offset.set(offX, offY);
              mat.map.needsUpdate = true;
              mat.needsUpdate = true;
            }
          }
        } catch (err) {}
      }

      applyTextureTransform();
      plane.addEventListener('materialtextureloaded', applyTextureTransform, { once: true });
    }

    if (video.readyState >= 1) {
      updatePlaneMapping();
    } else {
      video.addEventListener('loadedmetadata', updatePlaneMapping);
    }
    video.addEventListener('canplay', updatePlaneMapping);

    function revealPlane() {
      if (video.currentTime > 0 || video.readyState >= 1) {
        plane.setAttribute('visible', 'true');
        updatePlaneMapping();
      }
    }
    video.addEventListener('playing', revealPlane);
    video.addEventListener('timeupdate', revealPlane);
    video.addEventListener('loadeddata', revealPlane);
    video.addEventListener('canplay', revealPlane);

    var r2Fallback = "${esc(r2VideoUrl)}";
    video.addEventListener('error', function() {
      if (r2Fallback && video.src !== r2Fallback) {
        console.warn('Switching to storage fallback:', r2Fallback);
        video.src = r2Fallback;
        try { video.load(); } catch(e){}
        revealPlane();
      }
    });

    try {
      video.load();
    } catch (e) {}

    // Scan overlay + controls references
    var scanOverlay = document.getElementById('scan-overlay');
    var arControls = document.getElementById('ar-controls');
    var btnReplay = document.getElementById('btn-replay');

    // Replay pill button
    if (btnReplay) {
      btnReplay.addEventListener('click', function() {
        video.currentTime = 0;
        video.play().catch(function(){});
      });
    }

    var sceneEl = document.querySelector('a-scene');
    sceneEl.addEventListener('xrimagefound', function(ev) {
      if (!ev || !ev.detail || ev.detail.name !== 'target0') return;

      // Haptic double-buzz — feels like a "lock-on" confirmation
      if (navigator.vibrate) navigator.vibrate([40, 50, 40]);

      // Hide scanning reticle, show audio/replay controls
      if (scanOverlay) scanOverlay.classList.add('hidden');
      if (arControls) arControls.style.display = 'flex';

      video.muted = false;
      var p = video.play();
      if (p && p.catch) {
        p.catch(function() {
          video.muted = false;
          video.play().catch(function(){});
        });
      }
      plane.setAttribute('visible', 'true');
      updatePlaneMapping();
    });

    sceneEl.addEventListener('xrimagelost', function(ev) {
      if (!ev || !ev.detail || ev.detail.name !== 'target0') return;
      video.pause();
      // Bring scanning guide back; hide controls while re-searching
      if (scanOverlay) scanOverlay.classList.remove('hidden');
      if (arControls) arControls.style.display = 'none';
    });

    function primeAudio() {
      if (video) video.muted = false;
    }
    document.addEventListener('touchstart', primeAudio, { passive: true, once: true });
    document.addEventListener('click', primeAudio, { once: true });
  </script>
</body>
</html>`;
}


