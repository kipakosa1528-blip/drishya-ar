# Kipakosa AR — Landing Page Design Overhaul Handover Document

**Project**: Kipakosa AR (Living Physical Photo Prints & WebAR)  
**Live Production URL**: [https://kipakosa.vercel.app](https://kipakosa.vercel.app)  
**Creator Studio / Admin**: [https://kipakosa.vercel.app/admin.html](https://kipakosa.vercel.app/admin.html)  
**Repository**: `https://github.com/kipakosa1528-blip/drishya-ar.git`  
**Date**: August 2026

---

## 1. Reference Websites & Design DNA

These 5 reference websites define the desired benchmark for visual quality, motion design, and interaction architecture:

| Reference Website | URL | Key Architectural & Aesthetic Traits to Emulate |
| :--- | :--- | :--- |
| **Sam Thies** | [samthies.com](https://samthies.com/?ref=landing.love) | • Sticky full-viewport canvas with scroll-synced video scrub.<br>• Minimalist edge-pinned navigation (Index, About, Audio toggle).<br>• Screen-spanning bold typography and fluid magnetic cursor. |
| **Matcha Cartel** | [matcha-cartel.com](https://matcha-cartel.com/index?ref=landing.love) | • High-contrast dark mode with rich black surfaces.<br>• Floating 3D layered parallax components moving across different scroll planes.<br>• Horizontal media scrub tracks. |
| **Horeca Social** | [horeca-social.com](https://www.horeca-social.com/en?ref=landing.love) | • Screen-pinned multi-scene timeline (`ScrollTrigger.create({ pin: true })`).<br>• Full-screen ambient video background accelerating with scroll velocity.<br>• 3D spatial card transformations. |
| **Il Capo Production** | [ilcapoproduction.com](https://www.ilcapoproduction.com/?ref=landing.love) | • High-end cinematic production reel aesthetic.<br>• Massive display typography layered over full-bleed video.<br>• Floating magnetic video cards and ambient soundscape integration. |
| **Squarespace Brand** | [brand.squarespace.com](https://brand.squarespace.com/?ref=landing.love) | • Architectural 1px hairline grid system.<br>• Monolithic, high-contrast typography (pure black `#000` & stark white `#fff`).<br>• Smooth media scaling and mathematical layout alignment. |

---

## 2. Product Concept & Audience Directives

### The Product
Kipakosa AR creates **living physical photo prints and framed media**. A customer receives a physical fine-art photograph for their wall or desk. When anyone points their smartphone camera at the print, the physical photograph seamlessly springs to life into high-definition video playback right over the frame with zero app downloads.

### Target Audience & Tone
- **Consumer-First**: Everyday people looking to frame weddings, travel memories (e.g. Himalayan trips), family milestones, baby moments, or fine art decor.
- **Strict Anti-Jargon Rule**: Absolutely no developer or engineering terminology (e.g. *DO NOT use "6-DOF", "60 FPS surface lock", "luminance descriptors", "planar WebXR"*).
- **Core Value Proposition**:
  - *"Photos that move when you scan them."*
  - *"Frame your favorite videos. Scan with any phone. Zero apps needed."*
  - *"Simple 3 steps: Upload video ➔ Get physical frame ➔ Point phone to play."*

---

## 3. Video Assets & Media Specifications

### Raw Source Assets
- Source directory on local machine: `C:\Users\Saugat Shakya\Downloads\videos` (18 authentic 4K/HD MP4 video files of Himalayan landscapes, mountain ridges, cultural dances, temples, and timelapses).

### Web-Optimized Assets (Already Prepared in Repository)
All assets below have been transcoded to fast-loading web MP4s with exact pixel-registered frame-0 posters in `assets/exhibition/`:

| Asset Base Name | Aspect Ratio | Dimensions | Content Description | Video File | Poster File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `himalayan-flags` | 16:9 Landscape | 1280 × 720 | Prayer flags fluttering on snow mountain ridge | `assets/exhibition/himalayan-flags.mp4` | `assets/exhibition/himalayan-flags-poster.jpg` |
| `annapurna-golden` | 16:9 Landscape | 1280 × 720 | Golden hour sunset & drifting clouds on Annapurna peak | `assets/exhibition/annapurna-golden.mp4` | `assets/exhibition/annapurna-golden-poster.jpg` |
| `boudhanath-stupa` | 9:16 Portrait | 720 × 1280 | Boudhanath Stupa with pigeons taking flight | `assets/exhibition/boudhanath-stupa.mp4` | `assets/exhibition/boudhanath-stupa-poster.jpg` |
| `gurung-dancer` | 9:16 Portrait | 720 × 1280 | Cultural dancer spinning in traditional Gurung dress | `assets/exhibition/gurung-dancer.mp4` | `assets/exhibition/gurung-dancer-poster.jpg` |
| `swayambhu-spire` | 9:16 Portrait | 720 × 1280 | Swayambhunath Golden Spire & wind-whipped flags | `assets/exhibition/swayambhu-spire.mp4` | `assets/exhibition/swayambhu-spire-poster.jpg` |
| `nepal-flag` | 9:16 Portrait | 720 × 1280 | Crimson national flag waving above Phewa Lake | `assets/exhibition/nepal-flag.mp4` | `assets/exhibition/nepal-flag-poster.jpg` |
| `pokhara-clouds` | 9:16 Portrait | 720 × 1280 | Pokhara street timelapse with clouds parting over peak | `assets/exhibition/pokhara-clouds.mp4` | `assets/exhibition/pokhara-clouds-poster.jpg` |

---

## 4. Key Design & Interaction Requirements for the Next Designer

1. **Pinned Full-Viewport Background Video Stage (`pin: true`)**:
   - The ambient background video (`annapurna-golden.mp4` or mountain cloudscape) must stay locked/pinned full-screen.
   - Scrolling down the page must drive video scrub or playback acceleration (GSAP ScrollTrigger).
2. **Floating Parallax Components Moving on Top**:
   - Layered physical photo frames that glide across the screen with 3D perspective tilt.
   - All frames in the same grid/track must maintain **100% strict mathematical height and aspect-ratio symmetry** (no mismatched card heights).
3. **Strict Video Playback Behavior**:
   - **Static by default**: All photo frames must display crisp static photographs initially. No chaotic background auto-playback.
   - **Hover / Tap Trigger**: Moving cursor over a frame crossfades smoothly to the full HD video. Moving mouse away immediately pauses the video and returns to the still photo.
4. **Color Palette & Visual Rules**:
   - Palette: Deep Cinematic Obsidian (`#060709`), Matte Graphite (`#0e1117`), Stark Crisp White (`#ffffff`), Solar Ember (`#ff6b35`), and Electric Cyan (`#38bdf8`).
   - Clean architectural 1px hairline borders (`rgba(255, 255, 255, 0.1)`).
   - **Hard Anti-Slop Rules**: No generic SaaS cards, no Dribbble AI sparkle icons, no fake particle dust, and no museum/editorial archival styling.

---

## 5. File Structure & Entry Points

```
valiant-davinci/
├── index.html                   # Main landing page entry point
├── landing.html                 # Mirror copy of landing page
├── admin.html                   # Creator Studio Portal (Target creation, project management)
├── ar.html                      # WebAR camera scanner viewer (MindAR/8thWall)
├── css/
│   └── landing.css              # Main landing page stylesheet
├── js/
│   └── landing.js               # GSAP, ScrollTrigger, and 3D frame tilt logic
└── assets/
    ├── logo.svg                 # Kipakosa AR official SVG logo
    └── exhibition/              # Web-optimized MP4 videos and pixel-exact JPG posters
```

---

## 6. Build, Test & Deployment Commands

- **Local Dev Server**:
  ```bash
  python -m http.server 3000
  # or
  npx serve .
  ```
- **Automated Verification Tests (Playwright)**:
  ```bash
  node test_modern_cinematic.mjs
  ```
- **Vercel Production Deployment**:
  ```powershell
  # Set token as environment variable and deploy
  vercel --prod --yes
  ```
