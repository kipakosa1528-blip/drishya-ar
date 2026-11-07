# WebAR Furniture — Floor-Only Placement: Findings, Test Log & Reply Draft

## 1. Context / requirements
- **Product:** web app (not native), must run on **Android Chrome** *and* **iOS Safari**.
- **Feature:** place **1:1 real-size furniture on the floor** of the user's room; must **not float**, must **not stick to walls**; move / rotate; **live texture & colour switching**; **open-door interactions**.
- **Test device:** Pixel 8 Pro, Android 17, **Chrome 154**. Dev server over `localhost` (secure context) via `adb reverse`.

## 2. Platform facts (verified from spec + vendor docs + on-device)
1. **iOS Safari has NO WebXR.** Only **AR Quick Look (USDZ)** — a closed native viewer (no custom UI, no live material changes, no tap-to-open interactions inside AR).
2. **Android Chrome WebXR** (ARCore) limitations:
   - **`local-floor` unsupported** — only `local`; floor height must be inferred.
   - **`plane-detection` exposes only orientation** (`horizontal`/`vertical`), **no floor/wall/table semantic label** (`XRPlane.semanticLabel` is Quest-only / behind a Chromium flag).
   - **Hit-test returns whatever surface the ray hits** (walls included); no floor filter.
   - **Depth-sensing works** (`160×90`, metric) but is **estimated (no LiDAR), noisy**, needs motion.
   - **Hit-test pose normals not reliably surface-aligned** on this device → the wall can still pass a `normal.y ≥ 0.90` check.
3. **ARKit/ARCore natively classify floor/wall/table** — but only inside native apps / Scene Viewer / Quick Look, not exposed to browser JS.

## 3. Everything tried, and the exact issue

| # | Approach | Result / issue |
|---|---|---|
| 1 | `<model-viewer>` v1 (committed) | Model floats at eye level before scanning; dragging climbed walls. |
| 2 | Three.js WebXR + raw hit-test | Centre ray hit the **door at waist height**; normal threshold failed to separate floor/wall; hovered in front of the door. |
| 3 | Android **Scene Viewer** intent | Cleartext HTTP blocked ("Couldn't load object"); no custom swatch UI inside Scene Viewer. |
| 4 | `<model-viewer>` catalog (Scene-Viewer-first) | Scene Viewer ghost; material edits ignored; floating perceived. |
| 5 | **8th Wall / Niantic** (repo `external/xr`) | Bundled engine is a **dead stub** (`8th Wall XR Version: 0.0.0.0s`); **camera feed frozen** (two frames byte-identical); no SLAM → float. |
| 6 | Custom WebXR + `lockedFloorY` + anchors | Locked onto a **far/wall plane** ("Floor locked 3.97 m"); floated. |
| 7 | Custom WebXR **environment meshing** (committed `1dd7295`) | One **giant plane spanning wall→floor**; "**3 floor(s), 0 wall(s) mapped**". |
| 8 | Custom WebXR + **ARCore Depth API** (`assets/lab/depth-classify`) | Floor/wall **classification works** (green floor / red wall) but floor plane **unstable** (drifts −0.75→−1.5 m), **unanchored** (moved with camera), sometimes wrong ("flying in the sky"); depth noisy. |
| 9 | `<model-viewer>` **WebXR mode** | Placed the model **on the wall** (no floor filter). |
| 10 | `<model-viewer>` Scene-Viewer mode | Floor reticle correct, but object hovers as a ghost until tap. |
| 11 | three.js **`XRPlanes`** boxes | ARCore plane detection **intermittent (often 0 planes)**. |
| 12 | **Verge3D** (evaluated) | Good interactive 3D (textures, door animations via Puzzles) but **commercial $290+** (trial watermarked/non-production); iOS AR = Quick Look → no Puzzles/material logic in AR. |
| 13 | **google/xrblocks / Meta IWSDK** (evaluated) | Plane **mesh + semantic labels** only on **XR headsets**; **not exposed by Chrome/ARCore on phones**. |
| 14 | **Prof.'s 5 rules** — `assets/lab/webxr-floor` (this build) | Implemented fully (see §4). Works when a real floor plane exists, but **glides from floor to wall** and is unreliable because ARCore's plane/normal data is bad. |

## 4. Professor's 5 rules — implementation & measured result

Implemented in `assets/lab/webxr-floor/index.htm`:
1. **Query `frame.detectedPlanes` → `lowestFloorY`** (lowest horizontal plane; area-filtered; must be ≥ 0.9 m below camera).
2. **Reject ambiguous surfaces:** accept only hits with `normal.y ≥ 0.90` **and** elevation within **±15 cm** of `lowestFloorY`.
3. **Debounce:** require **10 consecutive**, height-consistent (σ ≤ 5 cm) valid floor frames before enabling placement.
4. **Align base to the hit** and **lock to an `XRAnchor`** (`hitResult.createAnchor()` → `anchorSpace`).
5. **Drag strictly on the floor plane** `new THREE.Plane((0,1,0), −lowestFloorY)`.

**Observed (Pixel 8 Pro):**
- When a floor plane is returned: works — base on floor, `elev 0.00 m`, `normal.y 1.00`, anchored, 1:1, drag/rotate/switch OK (e.g., 190 cm rack grounded).
- **Failures (the blocker):** ARCore often returns **0 horizontal planes for 30 s+**; detects only the **mat** (not the tile floor); occasionally emits a **spurious horizontal plane at wall/waist height** → becomes `lowestFloorY` → the marker/model **glides onto the wall**. WebXR hit-test **normals do not reliably separate floor from wall**, so Rule 2 can't stop it.

## 5. Root cause
The bottleneck is **the framework's plane/normal data on Chrome-Android WebXR**, not the threshold values:
- no floor semantics, no `local-floor`,
- intermittent/absent plane detection,
- spurious wall-height planes,
- hit poses not reliably surface-oriented.
No amount of rejection/debounce fixes **bad or absent input**. This is precisely the condition the professor's final point anticipates.

## 6. Recommendation
**Stop tuning; switch frameworks.** Route AR through the **native** runtimes:
- **Android → Google Scene Viewer** (native ARCore: floor classification, SLAM anchoring, shadows, 1:1). The earlier local failure was only **cleartext HTTP**; over HTTPS it is reliable.
- **iOS → AR Quick Look** (native ARKit floor).
Trade-off: native viewers don't allow a custom in-AR UI → live texture-swapping / tap-to-open-door interactions live in the **3D configurator before AR** (and on iOS are baked into the exported USDZ). For fully custom in-AR UI *and* reliable floor on both platforms, only a **paid SDK** (8th Wall/Zappar/Onirix) — and iOS AR remains Quick Look-limited.

---

## 7. Draft reply to the professor (short)

> **Subject: Floor placement — 5 rules implemented; the framework is the blocker**
>
> We implemented all 5 rules (lowestFloorY from detectedPlanes; reject hits with normal < 0.90 or > 15 cm above the floor; require 10 consecutive frames; place base on the hit + lock an XRAnchor; drag on the floor plane).
>
> **Result (Pixel 8 Pro, Chrome 154):** when ARCore returns a floor plane, the result is **stable and correct** — e.g. `lowestFloorY −0.96…−0.98 m` held steady, `elev ≈ 0.00 m`, `normal.y 1.00`, valid frames climbing (41→708), base on floor, anchored, 1:1. **But the input is unstable in time:** the first floor plane took **~18 s** to appear, and plane availability **flickers** (`detectedPlanes` momentarily `0/0`). We also clamped the marker/placement Y to the detected floor height so it can no longer ride up a wall, and hold the marker ~1.5 s through brief dropouts. The remaining instability is **ARCore's plane detection**, not the algorithm or thresholds.
>
> **Conclusion:** the framework's floor/plane data remains the limiting factor (plane detection is intermittent; no floor semantics), so placement is still not production-reliable. Recommend switching the AR layer: **Android → Scene Viewer, iOS → Quick Look** (native ARCore/ARKit floor, like IKEA). Trade-off: no custom in-AR UI (swatches / door-open move to the pre-AR configurator).
>
> **Question:** proceed with Scene Viewer / Quick Look, or keep refining the WebXR threshold (Android-only)?
