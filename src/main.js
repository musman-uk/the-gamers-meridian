import { initGlobe } from './globe/globe.js';
import { initUI, openPostcardModal } from './ui.js';

try {
  const gameModules = import.meta.glob('./data/games/*/game.json', { eager: true });
  const imageModules = import.meta.glob('./data/games/**/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });

  const gamesCatalog = Object.values(gameModules)
    .map(mod => mod.default)
    .sort((a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true })
    );

  function resolvePhoto(gameId, photoPath) {
    if (!photoPath) {
      return `${import.meta.env.BASE_URL}textures/default-dispatch.jpg`;
    }
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
      return photoPath;
    }
    const cleanPath = photoPath.startsWith('/') ? photoPath.slice(1) : photoPath;
    const localKey = `./data/games/${gameId}/${cleanPath}`;

    return imageModules[localKey] || `${import.meta.env.BASE_URL}textures/default-dispatch.jpg`;
  }

  const allLocations = gamesCatalog.flatMap(game =>
    game.locations.map(loc => ({
      ...loc,
      gameId: game.id,
      game: game.title || game.franchise,
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
    (isOpen) => globeApi.setModalState(isOpen),
    {
      setGlobeMode: globeApi.setGlobeMode,
      setPinVisibility: globeApi.setPinVisibility
    }
  );
} finally {
  document.documentElement.classList.remove('is-loading');
}
