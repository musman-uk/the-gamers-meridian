# 🌍 The Gamer's Meridian

This repository contains [The Gamer's Meridian](https://musman-uk.github.io/the-gamers-meridian/) - an interactive 3D web application anchoring virtual world settings from historical and modern video games onto real Earth coordinates using Three.js and Vite.

---

## Project Contents

A short summary of what each part of the project contains:

- `.github/workflows/` – automated GitHub Actions workflow for building and deploying the site  
- `src/assets/` – styling files including Tailwind CSS configuration and dark-space theme rules  
- `src/data/games/` – game JSON catalogs and media files broken down by title (`ac1`, `ac2`, `u1`, `u2`)  
- `src/globe/` – Three.js globe initialization, texture loading, camera controls, and pin overlays  
- `src/globe/textures/` – high-resolution Earth map textures (atmosphere, normal, specular, and cloud maps)  
- `src/` – core application scripts including UI handlers (`ui.js`) and application initialization (`main.js`)  
- `.gitignore` – patterns specifying files and directories excluded from version control  
- `index.html` – main HTML entry file containing layout structure and preloader setup  
- `vite.config.js` – Vite configuration specifying build options and base path settings  
- `package.json` – project dependencies, scripts, and build configurations  

---

## Development Overview

A simplified view of how the website is being developed:

| Stage         | Location                | Purpose                                                |
|---------------|-------------------------|--------------------------------------------------------|
| Author        | `src/data/` & `src/`    | Content, 3D scenes, and UI components are developed    |
| Build         | `vite.config.js`        | Vite bundles scripts, textures, and Tailwind styles    |
| Automate      | `.github/workflows/`    | Actions workflow compiles code upon manual dispatch    |
| Deploy        | GitHub Pages            | Production build output served directly to the web     |

---

## Status

Version `0.0.0` – Unpublished  

---

<sub>© Mohammed Usman</sub>

