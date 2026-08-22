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
 * @param {object} p.targetData 8th Wall target descriptor
 * @param {number} p.planeW rendered plane width
 * @param {number} p.planeH rendered plane height
 * @param {number} p.tW target image width in px
 * @param {number} p.tH target image height in px
 */
export function renderArPage({ name, videoUrl, targetData, planeW, planeH, tW, tH }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${esc(name)} — Kipakosa AR</title>
  <script crossorigin="anonymous" src="/external/8frame-1.5.0.min.js"></script>

  <script src="/external/xr/xr.js" async crossorigin="anonymous" data-preload-chunks="slam"></script>
  <script src="https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js" crossorigin="anonymous"></script>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; touch-action:none; background:#000; }
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

    /* Audio Prompt */
    #audio-prompt {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: rgba(9, 13, 22, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 9999px;
      border: 1px solid rgba(59, 130, 246, 0.5);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      display: none;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      animation: pulsePrompt 2s infinite ease-in-out;
    }

    @keyframes pulsePrompt {
      0%, 100% { transform: translateX(-50%) scale(1); }
      50% { transform: translateX(-50%) scale(1.04); }
    }
  </style>
</head>
<body>
  <!-- Watermark Badge -->
  <div id="ar-watermark">
    <img src="/assets/logo.svg" alt="Logo" />
    <span>Kipakosa<span>AR</span></span>
  </div>

  <!-- Audio Tap Prompt -->
  <div id="audio-prompt">
    <span>🔊</span> <span>Tap screen for sound</span>
  </div>

  <script>
    var targetData = ${jsonForScript(targetData)};
    var onxrloaded = function() {
      XR8.XrController.configure({ imageTargetData: [targetData] });
    };
    window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded);
  </script>

  <a-scene xrextras-loading xrextras-runtime-error
    renderer="colorManagement:true"
    xrweb="allowedDevices: any; disableWorldTracking: true; disableDefaultEnvironment: true">
    <a-assets>
      <video id="ar-video" src="${esc(videoUrl)}"
        preload="auto" loop playsinline webkit-playsinline crossorigin="anonymous" muted>
      </video>
    </a-assets>
    <a-camera position="0 0 0"></a-camera>
    <xrextras-named-image-target name="target0">
      <a-plane id="ar-plane" width="${Number(planeW)}" height="${Number(planeH)}" position="0 0 0.01"
        material="src: #ar-video; transparent: true; alphaTest: 0.01; shader: flat; side: double; repeat: 1 1; offset: 0 0">
      </a-plane>
    </xrextras-named-image-target>
  </a-scene>

  <script>
    var video = document.getElementById('ar-video');
    var plane = document.getElementById('ar-plane');
    var audioPrompt = document.getElementById('audio-prompt');

    video.addEventListener('loadedmetadata', function() {
      var tW = Number(${Number(tW)}) || 640;
      var tH = Number(${Number(tH)}) || 640;
      var tAspect = tW / tH;
      var vW = video.videoWidth;
      var vH = video.videoHeight;
      var vAspect = (vW && vH) ? (vW / vH) : tAspect;

      // Plane size matches target aspect ratio
      if (tAspect >= 1) {
        plane.setAttribute('width', 1);
        plane.setAttribute('height', (1 / tAspect).toFixed(4));
      } else {
        plane.setAttribute('width', tAspect.toFixed(4));
        plane.setAttribute('height', 1);
      }

      // UV texture mapping: auto-crop video to cover target plane edge-to-edge without letterboxing or stretching
      if (vAspect > tAspect) {
        // Video is wider than target: crop left and right edges
        var repeatX = tAspect / vAspect;
        var offsetX = (1 - repeatX) / 2;
        plane.setAttribute('material', 'repeat', repeatX.toFixed(4) + ' 1');
        plane.setAttribute('material', 'offset', offsetX.toFixed(4) + ' 0');
      } else if (vAspect < tAspect) {
        // Video is taller than target: crop top and bottom edges
        var repeatY = vAspect / tAspect;
        var offsetY = (1 - repeatY) / 2;
        plane.setAttribute('material', 'repeat', '1 ' + repeatY.toFixed(4));
        plane.setAttribute('material', 'offset', '0 ' + offsetY.toFixed(4));
      } else {
        plane.setAttribute('material', 'repeat', '1 1');
        plane.setAttribute('material', 'offset', '0 0');
      }
    });

    var sceneEl = document.querySelector('a-scene');
    sceneEl.addEventListener('xrimagefound', function(ev) {
      if (ev.detail.name !== 'target0') return;
      video.muted = false;
      video.play().catch(function() {
        video.muted = true;
        video.play().catch(function(){});
        audioPrompt.style.display = 'flex';
      });
    });

    sceneEl.addEventListener('xrimagelost', function(ev) {
      if (ev.detail.name !== 'target0') return;
      video.pause();
      audioPrompt.style.display = 'none';
    });

    function unmuteUser() {
      video.muted = false;
      video.play().catch(function(){});
      audioPrompt.style.display = 'none';
    }

    document.addEventListener('touchstart', unmuteUser, { passive: true });
    document.addEventListener('click', unmuteUser);
  </script>
</body>
</html>`;
}

