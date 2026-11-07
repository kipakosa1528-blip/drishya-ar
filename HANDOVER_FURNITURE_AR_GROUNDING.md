# Handover: 3D Furniture AR — Definitive Strategic Verdict & Architecture

> **Status:** Final Architectural Verdict & Strategic Roadmap  
> **Verdict:** WebXR heuristics and raw ARCore raycasting are terminated. Unity 6 GB installation skipped. Semantic floor-only prototype moves to **Native iOS / ARKit Scene Reconstruction (`meshWithClassification`)**, with Android maintained on a separate engineering track via **ARCore Depth API** (and Google Scene Viewer as a viewing fallback).

---

## 1. Verbatim User Requirements (Preserved)

> *"to make 3d furniture placeable in ar in web so that people can see how the furniture will look in their rooms, rotate and move them around their house and room, change their texture and color in real time, it should not float in air, it should be anchored to the place it is placed and not move around, it should have 1:1 actual scale so people can actually know if it fits in their room with other furniture, my requirements are clear as day and it is not something new, companies are already doing such that for decades. yet you are making subpar useless demo, also use the other glb models in `C:\Users\Saugat Shakya\Documents\blends\demo`, for the 1:1 scale test and compare with the door"*

### Non-Negotiable System Requirements:
1. **Floor-Only Grounding (Zero Floating):** Furniture must be placed strictly on the physical floor, never levitating in mid-air or sticking to walls and doors.
2. **Persistent Anchoring:** Pinned to physical SLAM world space without drift.
3. **1:1 Metric Scale (Verified Against Physical ~200 cm Door):**
   - `worn_metal_rack.glb` (190 cm tall).
   - `throne_of_birds.glb` (190 cm tall).
   - `iskra-unitra_rm_312_radio.glb` (27.5 cm wide).
   - `sofa.glb` (190 cm wide × 61.3 cm high).
4. **Constrained Manipulation:** Free to move across the floor and rotate, but physically blocked from climbing walls or leaving the floor.
5. **Real-Time Texture/Color Switching:** Live material swapping inside the AR view.

---

## 2. Definitive Technology Verdict

| Technology | Problem / Reality | Verdict |
| :--- | :--- | :--- |
| **WebXR + ARCore** | Generic geometry, no indoor semantics; floor plane bleeds through walls while detecting 0 vertical walls. | ❌ **STOP** |
| **More WebXR Heuristics** | Normal thresholds, ray angles, temporal debouncing cannot fix fundamentally ambiguous data. | ❌ **STOP** |
| **Unity + AR Foundation** | Cross-platform, but Android ARCore classification is provider-dependent (outdoor only). Skipping 6 GB install. | ⚠️ **Deferred** |
| **Native iOS ARKit** | Reconstructed mesh natively classified into `floor`, `wall`, `door`, `table`, `seat`, `window`. | 🥇 **BEST SEMANTIC PROTOTYPE** |
| **Google Scene Viewer** | Handles floor pinning natively, but is a black box (no programmable floor-region, custom drag, or boundary constraints). | ⚠️ **Fallback Only** (Simple View) |
| **Custom Android + Depth** | Pixel 8 Pro supports ARCore Depth API; requires building custom depth-based wall segmentation. | 🟡 **Android Track** (Substantial engineering) |

---

## 3. The Core Architecture: Semantic Floor-First System

```
                  REAL ROOM
          WALL ┃████████████████
               ┃
               ┃  (Obstacle: Wall / Door)
               ┃
    ───────────┻──────────────────
                FLOOR
```

### The Placement Pipeline (iOS / ARKit Prototype):
```
Camera
  ↓
ARKit Reconstructed Mesh
  ↓
Screen Ray → Mesh Intersect
  ↓
Query Face Classification (ARMeshClassification)
  ↓
Is Face Classification == FLOOR?
  ├── YES → Valid Furniture Position (Pin to floor anchor, align Y to floor)
  └── NO  → REJECT (Wall, Door, Table, or Obstacle — Do not place!)
```

### The Dragging Pipeline (Floor-Constrained 2D Movement):
```
Finger Touchmove
  ↓
Screen Ray → Intersect Known Floor Mesh ONLY
  ↓
X / Z Updated in 2D Floor Plane
Y HARD LOCKED to detectedFloorY
  ↓
Footprint Validation (Entire furniture footprint ⊆ floor boundary)
  ↓
If finger drags over a wall:
No floor mesh face under ray → DO NOT MOVE (Clamped to floor boundary)
Furniture physically CANNOT climb walls or float in mid-air.
```

---

## 4. Immediate Phased Action Plan

### Track 1: iOS Semantic Prototype (Primary Proof of Concept)
1. **Target:** Device with iOS / LiDAR (or standard ARKit).
2. **Build minimal test:**
   - Configure `ARWorldTrackingConfiguration.sceneReconstruction = .meshWithClassification`.
   - Implement raycast against `ARMeshAnchor` geometry.
   - Print intersected face classification (`floor`, `wall`, `door`).
   - Prove: **Camera → Ray → Mesh → Classification == FLOOR? → Valid / Reject**.

### Track 2: Android Engineering (Separate Track)
1. **Short-Term Fallback:** Expose Google Scene Viewer via secure HTTPS for simple 1:1 scale preview against the door frame.
2. **Long-Term Production:** Utilize native Android ARCore **Depth API** on the Pixel 8 Pro to extract real-world depth distances and mathematically reject virtual floor areas located behind physical depth obstacles (walls/doors).

---

## 5. Catalog & Metric Model References
All models are normalized to metric scale (min Y = 0) in `assets/models/furniture/`:
- `rack.glb` (91.5 cm W × 190.0 cm H × 60.0 cm D)
- `throne.glb` (118.5 cm W × 190.0 cm H × 114.0 cm D)
- `radio.glb` (27.5 cm W × 39.7 cm H × 10.0 cm D)
- `sofa.glb` (190.0 cm W × 61.3 cm H × 129.8 cm D)
- Processing pipeline: `scripts/prepare-furniture.mjs`
