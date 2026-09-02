// Server-rendered Multi-Target 8th Wall AR Magazine viewer page.
// Supports multi-page tracking with pixel-perfect bound video and image overlays per target.

import { esc, jsonForScript } from '../lib/security.js';

/**
 * Render the full-screen Multi-Target AR experience for a Magazine.
 * @param {object} p
 * @param {string} p.title magazine display title
 * @param {string} p.magId magazine unique ID
 * @param {Array} p.targets array of processed target objects with target_data and overlay
 */
export function renderMagazineArPage({ title, magId, targets = [] }) {
  // Extract all valid 8th Wall descriptors
  const targetDescriptors = targets
    .map(t => t.target_data)
    .filter(Boolean);

  const targetsConfig = targets.map((t, idx) => {
    const td = t.target_data || {};
    const props = td.properties || td.metadata || {};
    const tW = props.width || props.originalWidth || 640;
    const tH = props.height || props.originalHeight || 640;
    const tAspect = tW / tH;
    const planeW = tAspect >= 1 ? 1 : Number(tAspect.toFixed(4));
    const planeH = tAspect >= 1 ? Number((1 / tAspect).toFixed(4)) : 1;
    const ov = t.overlay || {};

    return {
      index: idx,
      targetName: t.target_name || ('target' + idx),
      tW,
      tH,
      tAspect,
      planeW,
      planeH,
      overlayType: ov.type || 'video',
      overlayUrl: ov.url || t.image_url,
      r2Fallback: t.image_url
    };
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${esc(title)} - Kipakosa AR Magazine</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg?v=1">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png?v=1">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v=1">
  
  <link rel="preconnect" href="https://stream.mux.com" crossorigin>
  <link rel="dns-prefetch" href="https://stream.mux.com">

  <!-- 8frame (A-Frame fork for 8th Wall) -->
  <script crossorigin="anonymous" src="/external/8frame-1.5.0.min.js"></script>
  <script src="/external/xr/xr.js" async crossorigin="anonymous" data-preload-chunks="slam"></script>
  <script defer src="/external/xrextras.js" crossorigin="anonymous"></script>

  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; touch-action:none; background:transparent; }
    .a-enter-vr, .a-enter-vr-button { display:none !important; }

    /* Suppress 8th Wall branding */
    .poweredby, .powered-by, .poweredby-8thwall, .xrextras-powered-by,
    .xrextras-loading-footer, .loading-footer, #poweredBy8thWall, #poweredby, #loading-footer,
    img[src*="powered-by"], img[src*="8thwall"], [id*="poweredBy" i], [class*="poweredBy" i] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      left: -9999px !important;
    }

    /* Holographic Header Badge */
    #mag-watermark {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(9, 13, 22, 0.78);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 6px 14px 6px 8px;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    #mag-watermark img {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      display: block;
    }

    #mag-watermark span {
      color: #f8fafc;
      font-size: 12px;
      font-weight: 700;
    }

    #mag-watermark .mag-pill {
      color: #38bdf8;
      font-size: 10px;
      font-weight: 800;
      background: rgba(56, 189, 248, 0.15);
      padding: 2px 6px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.3);
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
      width: 240px; height: 240px;
      border: 2px solid rgba(255,255,255,0.7);
      border-radius: 24px;
      box-shadow: 0 0 0 4px rgba(56,189,248,0.35);
      animation: scan-pulse 2s ease-in-out infinite;
    }
    @keyframes scan-pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(56,189,248,0.35); }
      50% { box-shadow: 0 0 0 16px rgba(56,189,248,0.0); }
    }
    .scan-hint {
      margin-top: 22px;
      color: rgba(255,255,255,0.95);
      font-size: 14px; font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif;
      text-shadow: 0 2px 6px rgba(0,0,0,0.8);
      letter-spacing: 0.02em;
    }
    .scan-subhint {
      color: rgba(148, 163, 184, 0.9);
      font-size: 12px;
      margin-top: 4px;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    }
  </style>
</head>
<body>
  <!-- Brand Badge -->
  <div id="mag-watermark">
    <img src="/assets/logo.svg" alt="Logo" />
    <span>Kipakosa AR</span>
    <span class="mag-pill">Multi-Target</span>
  </div>

  <!-- Scan Guide -->
  <div id="scan-overlay">
    <div class="scan-reticle"></div>
    <p class="scan-hint">Point camera at any magazine page</p>
    <div class="scan-subhint">${targets.length} AR targets active in this edition</div>
  </div>

  <!-- 8th Wall multi-target configuration -->
  <script>
    var targetDescriptors = ${jsonForScript(targetDescriptors)};
    var targetsConfig = ${jsonForScript(targetsConfig)};

    var onxrloaded = function() {
      XR8.XrController.configure({ imageTargetData: targetDescriptors });
    };
    window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded);
  </script>

  <script>
    if (typeof AFRAME !== 'undefined') {
      AFRAME.registerComponent('fit-model', {
        schema: {
          targetSize: { default: 0.70 },
          hoverZ: { default: 0.35 }
        },
        init: function() {
          this.el.addEventListener('model-loaded', () => {
            var obj = this.el.getObject3D('mesh') || this.el.object3D;
            if (!obj) return;
            var bbox = new THREE.Box3().setFromObject(obj);
            var size = bbox.getSize(new THREE.Vector3());
            var maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              var s = this.data.targetSize / maxDim;
              this.el.object3D.scale.set(s, s, s);
              this.el.object3D.position.set(0, 0, this.data.hoverZ);
            }
          });
        }
      });

      AFRAME.registerComponent('spin-axis', {
        schema: { speed: { default: 28 } },
        tick: function(t, dt) {
          if (this.el.object3D) {
            this.el.object3D.rotation.y += (this.data.speed * dt * Math.PI) / 180000;
          }
        }
      });
    }
  </script>

  <a-scene xrextras-loading xrextras-runtime-error
    renderer="colorManagement:true;alpha:true;antialias:true"
    xrweb="allowedDevices: any; disableWorldTracking: true; disableDefaultEnvironment: true">
    
    <a-assets>
      ${targetsConfig.map((t, idx) => {
        if (t.overlayType === '3d') {
          return `<a-asset-item id="ov-model-${idx}" src="${esc(t.overlayUrl)}"></a-asset-item>`;
        } else if (t.overlayType === 'image') {
          return `<img id="ov-img-${idx}" src="${esc(t.overlayUrl)}" crossorigin="anonymous" />`;
        } else {
          return `<video id="ov-vid-${idx}" src="${esc(t.overlayUrl)}" preload="auto" loop playsinline webkit-playsinline crossorigin="anonymous" muted autoplay></video>`;
        }
      }).join('\n      ')}
    </a-assets>

    <a-camera position="0 0 0"></a-camera>

    <!-- Multi-target named tracking entities with pixel-perfect plane sizing -->
    ${targetsConfig.map((t, idx) => {
      if (t.overlayType === '3d') {
        return `
    <xrextras-named-image-target name="${esc(t.targetName)}">
      <a-entity id="mag-model-container-${idx}" position="0 0 0.35" rotation="90 0 0">
        <a-entity id="mag-model-${idx}" gltf-model="#ov-model-${idx}" fit-model="targetSize: 0.65" spin-axis visible="false"></a-entity>
      </a-entity>
    </xrextras-named-image-target>`;
      }
      const isImg = t.overlayType === 'image';
      const matSrc = isImg ? `#ov-img-${idx}` : `#ov-vid-${idx}`;

      return `
    <xrextras-named-image-target name="${esc(t.targetName)}">
      <a-plane id="mag-plane-${idx}" width="${t.planeW}" height="${t.planeH}" position="0 0 0.01" visible="false"
        material="src: ${matSrc}; transparent: true; alphaTest: 0.01; shader: flat; side: double">
      </a-plane>
    </xrextras-named-image-target>`;
    }).join('\n')}

  </a-scene>

  <script>
    var targetsCount = targetsConfig.length;
    var scanOverlay = document.getElementById('scan-overlay');
    var activeTargetIdx = null;

    function updatePlaneMapping(i) {
      var target = targetsConfig[i];
      var plane = document.getElementById('mag-plane-' + i);
      if (!plane) return;

      var tW = target.tW || 640;
      var tH = target.tH || 640;
      var tAspect = tW / tH;
      var vW = tW, vH = tH;

      if (target.overlayType === 'video') {
        var vid = document.getElementById('ov-vid-' + i);
        if (vid && vid.videoWidth) { vW = vid.videoWidth; vH = vid.videoHeight; }
      } else {
        var img = document.getElementById('ov-img-' + i);
        if (img && img.naturalWidth) { vW = img.naturalWidth; vH = img.naturalHeight; }
      }

      var vAspect = (vW && vH) ? (vW / vH) : tAspect;

      // 8th Wall normalized coordinate mapping
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

    // Initialize mapping for all targets
    for (var k = 0; k < targetsCount; k++) {
      (function(idx) {
        var target = targetsConfig[idx];
        if (target.overlayType === 'video') {
          var vid = document.getElementById('ov-vid-' + idx);
          if (vid) {
            if (vid.readyState >= 1) updatePlaneMapping(idx);
            else vid.addEventListener('loadedmetadata', function() { updatePlaneMapping(idx); });
            vid.addEventListener('canplay', function() { updatePlaneMapping(idx); });
          }
        } else {
          var img = document.getElementById('ov-img-' + idx);
          if (img) {
            if (img.complete) updatePlaneMapping(idx);
            else img.addEventListener('load', function() { updatePlaneMapping(idx); });
          }
        }
      })(k);
    }

    // Listen for image tracking events across all targets
    window.addEventListener('xrimagefound', function(e) {
      if (scanOverlay) scanOverlay.classList.add('hidden');
      var name = e.detail ? e.detail.name : '';
      
      for (var i = 0; i < targetsCount; i++) {
        var tName = targetsConfig[i].targetName;
        var planeEl = document.getElementById("mag-plane-" + i);
        var modelEl = document.getElementById("mag-model-" + i);
        var vidEl = document.getElementById("ov-vid-" + i);

        if (name === tName) {
          activeTargetIdx = i;
          updatePlaneMapping(i);
          if (modelEl) modelEl.setAttribute('visible', 'true');
          if (planeEl) planeEl.setAttribute('visible', 'true');
          if (vidEl) {
            vidEl.muted = false; // Always unmute with full audio
            vidEl.currentTime = 0;
            vidEl.play().catch(function() {
              vidEl.muted = true;
              vidEl.play();
            });
          }
        }
      }
    });

    window.addEventListener('xrimagelost', function(e) {
      var name = e.detail ? e.detail.name : '';
      for (var i = 0; i < targetsCount; i++) {
        var tName = targetsConfig[i].targetName;
        if (name === tName) {
          var planeEl = document.getElementById("mag-plane-" + i);
          var modelEl = document.getElementById("mag-model-" + i);
          var vidEl = document.getElementById("ov-vid-" + i);
          if (modelEl) modelEl.setAttribute('visible', 'false');
          if (planeEl) planeEl.setAttribute('visible', 'false');
          if (vidEl) vidEl.pause();
          if (activeTargetIdx === i) activeTargetIdx = null;
        }
      }
      if (scanOverlay) scanOverlay.classList.remove('hidden');
    });

    window.addEventListener('click', function() {
      if (activeTargetIdx !== null) {
        var vidEl = document.getElementById("ov-vid-" + activeTargetIdx);
        if (vidEl && vidEl.paused) {
          vidEl.muted = false;
          vidEl.play().catch(function() {});
        }
      }
    });
  </script>
</body>
</html>`;
}
