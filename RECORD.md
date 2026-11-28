# RECORD

## 1. Design Style

### Reading & Visual Environment
- Deep Space Navy palette (`#020617` base) prioritizing high-contrast, immersive exploration  
- Micro-badge overlay system for seamless geographic and metadata presentation  
- Dual-tier typography using classic serif (`Cinzel`), monospace (`Courier Prime`), and handwritten (`Caveat`) fonts  
- Semantic CSS variable system (`--journal-*`) for instant palette switching and unified theme control  

### Interaction & Accessibility
- Touch-friendly 3D viewport controls paired with accessible drawer and modal triggers  
- Interactive 180° card-flip mechanics with clear visual orientation cues  
- Responsive side-drawer navigation supporting mobile viewports and desktop displays  

### Layout System
- Clean spatial rhythm: WebGL viewport → floating header controls → slide-out travel journal → postcard overlays  
- Fixed viewport framing with locked overflow preventing layout shifts  
- Dynamic regional tabs for multi-destination setting logs  
- Aspect-ratio locked postcard canvas maintaining 16:10 ratio across breakpoints  

---

## 2. Development Process

### Content Model
- Modular JSON catalogs stored under `src/data/games/[gameId]/game.json`  
- Schema defines game metadata, franchise tags, setting eras, quotes, spatial trivia, and coordinates  
- Dual-Tier Location Schema mapping historical/fictional settings to real Earth coordinates  

### Component & Render System
- Three.js WebGL globe engine handling texture mapping, atmosphere rendering, camera flight animations, and pin overlays  
- Dynamic UI generator (`ui.js`) constructing volume cards, dispatch logs, and modal views  
- Vite eager module resolution (`import.meta.glob`) automatically resolving localized images and data catalogs  

### Build Pipeline
- Vite bundles JavaScript modules, Three.js textures, and Tailwind CSS rules  
- Output compiled to `dist/` for GitHub Pages deployment  
- `.github/workflows/build-site.yml` automates verification and static deployment on dispatch  
- Relative base path configuration ensuring seamless subpath deployment on GitHub Pages  

---

## 3. Milestones

### Repository & Engine Setup
- Project directory structure established (`src/assets`, `src/data`, `src/globe`)  
- Three.js WebGL sphere rendering, camera orbit controls, and atmospheric glow implemented  
- Geographic coordinate projection formula added to place city pins on 3D globe surface  

### Data Schema & UI Layer
- JSON catalog structure defined for historical and modern game settings  
- Travel Journal drawer (`#bookletDrawer`) implemented to list game volumes and locations  
- Postcard modal view created with 3D flip card effect and regional sub-location tabs  

### Theme Overhaul & Polish
- Refactored legacy parchment theme to unified Deep Space Navy design system  
- Replaced hardcoded color utility classes in HTML and JS with semantic CSS variables  
- Implemented instant head-style preloader to eradicate startup FOUC  
- Created structured project documentation (`README.md` and `RECORD.md`)  

---

## 4. Version History

### v1.0.0 - Published
- Initial 3D WebGL globe implementation using Three.js and Vite  
- Created catalog entries for Assassin's Creed (1 & 2) and Uncharted (1 & 2)  
- Implemented Travel Journal drawer and 180° flipping postcard modal interface  
- Established semantic CSS custom variable architecture (`--journal-*`)  
- Integrated FOUC preloader mechanism for zero layout-shift startup  
- Configured automated GitHub Actions deployment workflow  
