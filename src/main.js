import './assets/style.css';
import { initGlobe } from './globe/globe.js';
import { initUI, openPostcardModal } from './ui.js';

const gameModules = import.meta.glob('./data/games/*/game.json', { eager: true });
// Use recursive glob (**) to catch images in subdirectories
const imageModules = import.meta.glob('./data/games/**/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });

const gamesCatalog = Object.values(gameModules).map(mod => mod.default);

function resolvePhoto(gameId, photoPath) {
  if (!photoPath) {
    return `${import.meta.env.BASE_URL}textures/default-dispatch.jpg`;
  }
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath;
  }
  // Strip any leading slash from JSON photo paths
  const cleanPath = photoPath.startsWith('/') ? photoPath.slice(1) : photoPath;
  const localKey = `./data/games/${gameId}/${cleanPath}`;

  // Fallback uses import.meta.env.BASE_URL so it resolves under /repo-name/
  return imageModules[localKey] || `${import.meta.env.BASE_URL}textures/default-dispatch.jpg`;
}

const allLocations = gamesCatalog.flatMap(game => 
  game.locations.map(loc => ({
    ...loc,
    gameId: game.id,
    game: game.franchise,
    color: game.color,
    themeClass: game.themeClass,
    photo: resolvePhoto(game.id, loc.photo),
    subLocations: loc.subLocations?.map(sub => ({
      ...sub,
      photo: resolvePhoto(game.id, sub.photo)
    }))
  }))
);

const globeApi = initGlobe(allLocations, (loc, subId) => openPostcardModal(loc, subId));

initUI(
  gamesCatalog,
  (locId, subId) => globeApi.flyToAndOpenLocation(locId, subId, (loc, sub) => openPostcardModal(loc, sub)),
  (isOpen) => globeApi.setModalState(isOpen)
);

document.documentElement.classList.remove('is-loading');
