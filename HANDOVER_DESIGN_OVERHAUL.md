# Kipakosa AR — Design Handover Document

**Project**: Kipakosa AR  
**Live Production URL**: [https://kipakosa.vercel.app](https://kipakosa.vercel.app)  
**Creator Studio / Admin**: [https://kipakosa.vercel.app/admin.html](https://kipakosa.vercel.app/admin.html)  
**Repository**: `https://github.com/kipakosa1528-blip/drishya-ar.git`  
**Date**: August 2026

---

## 1. Reference Websites

The design overhaul should reference these websites:

1. **Sam Thies**: [https://samthies.com/?ref=landing.love](https://samthies.com/?ref=landing.love)
2. **Matcha Cartel**: [https://matcha-cartel.com/index?ref=landing.love](https://matcha-cartel.com/index?ref=landing.love)
3. **Horeca Social**: [https://www.horeca-social.com/en?ref=landing.love](https://www.horeca-social.com/en?ref=landing.love)
4. **Il Capo Production**: [https://www.ilcapoproduction.com/?ref=landing.love](https://www.ilcapoproduction.com/?ref=landing.love)
5. **Squarespace Brand**: [https://brand.squarespace.com/?ref=landing.love](https://brand.squarespace.com/?ref=landing.love)

---

## 2. Assets & Media

### Local Raw Video Assets
- `C:\Users\Saugat Shakya\Downloads\videos` (18 MP4 video files)

### Transcoded Web Assets (in Repository)
Located in `./assets/exhibition/`:
- `himalayan-flags.mp4` / `himalayan-flags-poster.jpg` (16:9 Landscape)
- `annapurna-golden.mp4` / `annapurna-golden-poster.jpg` (16:9 Landscape)
- `boudhanath-stupa.mp4` / `boudhanath-stupa-poster.jpg` (9:16 Portrait)
- `gurung-dancer.mp4` / `gurung-dancer-poster.jpg` (9:16 Portrait)
- `swayambhu-spire.mp4` / `swayambhu-spire-poster.jpg` (9:16 Portrait)
- `nepal-flag.mp4` / `nepal-flag-poster.jpg` (9:16 Portrait)
- `pokhara-clouds.mp4` / `pokhara-clouds-poster.jpg` (9:16 Portrait)

---

## 3. Project Structure & Entry Points

```
valiant-davinci/
├── index.html                   # Main landing page entry point
├── landing.html                 # Landing page copy
├── admin.html                   # Creator Studio Portal
├── ar.html                      # WebAR scanner viewer
├── css/
│   └── landing.css              # Landing page styles
├── js/
│   └── landing.js               # Landing page scripts
└── assets/
    ├── logo.svg                 # SVG Logo
    └── exhibition/              # Video and image poster assets
```

---

## 4. Run & Deploy

- **Local Dev Server**:
  ```bash
  python -m http.server 3000
  # or
  npx serve .
  ```
- **Deploy**:
  ```powershell
  vercel --prod --yes
  ```
