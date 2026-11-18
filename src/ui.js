const STORAGE_KEY_PINNED = 'gp_pinned_locations_v1';
const FALLBACK_PHOTO = `${import.meta.env.BASE_URL}textures/default-dispatch.jpg`;

const PIN_SVG = `<svg class="w-2.5 h-2.5" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M32 32C32 14.3 46.3 0 64 0H320c17.7 0 32 14.3 32 32s-14.3 32-32 32H290.5l11.4 148.2c36.7 19.9 65.7 53.2 79.5 94.7l1 3c3.3 9.8 1.6 20.5-4.4 28.8s-15.7 13.3-26 13.3H32c-10.3 0-19.9-4.9-26-13.3s-7.7-19.1-4.4-28.8l1-3c13.8-41.5 42.8-74.8 79.5-94.7L93.5 64H64C46.3 64 32 49.7 32 32zM160 384h64v96c0 17.7-14.3 32-32 32s-32-14.3-32-32V384z"/></svg>`;

let currentActiveLoc = null;
let setGlobeModalStateRef = null;
let setGlobeModeRef = null;
let setPinVisibilityRef = null;
let utcTimer = null;
let pinnedIds = new Set();
let allTopLevelLocIds = [];
let cardPointerDownPos = { x: 0, y: 0 };

function loadPinPreferences(allIds) {
  allTopLevelLocIds = allIds;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PINNED);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        pinnedIds = new Set(parsed.filter(id => allIds.includes(id)));
        return;
      }
    }
  } catch {
    // Fallback to none pinned if storage is blocked
  }
  pinnedIds = new Set();
}

function savePinPreferences() {
  try {
    localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify([...pinnedIds]));
  } catch {
    // Ignore storage quota errors
  }
}

function syncPinStatesToGlobe() {
  allTopLevelLocIds.forEach(id => {
    const isVisible = pinnedIds.has(id);
    if (setPinVisibilityRef) setPinVisibilityRef(id, isVisible);
    document.querySelectorAll(`.pin-toggle-chip[data-pin-id="${id}"]`).forEach(chip => {
      chip.classList.toggle('is-unpinned', !isVisible);
      chip.title = isVisible ? 'Hide Pin on Globe' : 'Show Pin on Globe';
    });
  });

  const pinnedCount = pinnedIds.size;
  const countLabel = document.getElementById('stampedCountLabel');
  if (countLabel) {
    countLabel.textContent = `${pinnedCount} / ${allTopLevelLocIds.length} pinned`;
  }

  const toggleAllLabel = document.getElementById('toggleAllPinsLabel');
  if (toggleAllLabel) {
    toggleAllLabel.textContent =
      pinnedIds.size === allTopLevelLocIds.length ? 'Hide All Pins' : 'Show All Pins';
  }
}

function setDrawerOpen(bookletDrawer, open) {
  if (!bookletDrawer) return;
  bookletDrawer.classList.toggle('is-open', open);
  bookletDrawer.setAttribute('aria-hidden', String(!open));
}

function setStampModalOpen(stampModal, open) {
  if (!stampModal) return;
  stampModal.classList.toggle('is-open', open);
  stampModal.setAttribute('aria-hidden', String(!open));
}

export function initUI(gamesCatalog, onFlyToLocation, setGlobeModalState, globeControls = {}) {
  setGlobeModalStateRef = setGlobeModalState;
  setGlobeModeRef = globeControls.setGlobeMode || null;
  setPinVisibilityRef = globeControls.setPinVisibility || null;

  const topIds = gamesCatalog.flatMap(vol => vol.locations.map(loc => loc.id));
  loadPinPreferences(topIds);

  buildTravelJournalDrawer(gamesCatalog, onFlyToLocation);
  syncPinStatesToGlobe();
  initGlobeRocker();

  const albumToggle = document.getElementById('albumToggle');
  const bookletDrawer = document.getElementById('bookletDrawer');
  const drawerClose = document.getElementById('drawerClose');
  const webglContainer = document.getElementById('webgl-container');

  setDrawerOpen(bookletDrawer, false);

  if (albumToggle) {
    albumToggle.onclick = (e) => {
      e.stopPropagation();
      setDrawerOpen(bookletDrawer, !bookletDrawer.classList.contains('is-open'));
    };
  }
  if (drawerClose) {
    drawerClose.onclick = () => setDrawerOpen(bookletDrawer, false);
  }
  if (webglContainer) {
    webglContainer.onpointerdown = () => {
      if (bookletDrawer.classList.contains('is-open')) {
        setDrawerOpen(bookletDrawer, false);
      }
    };
  }

  const toggleAllPinsBtn = document.getElementById('toggleAllPinsBtn');
  if (toggleAllPinsBtn) {
    toggleAllPinsBtn.onclick = () => {
      if (pinnedIds.size === allTopLevelLocIds.length) {
        pinnedIds.clear();
      } else {
        pinnedIds = new Set(allTopLevelLocIds);
      }
      savePinPreferences();
      syncPinStatesToGlobe();
    };
  }

  const stampToggle = document.getElementById('stampToggle');
  const stampModal = document.getElementById('stampModal');
  const stampClose = document.getElementById('stampClose');

  if (stampToggle) {
    stampToggle.onclick = () => setStampModalOpen(stampModal, true);
  }
  if (stampClose) {
    stampClose.onclick = () => setStampModalOpen(stampModal, false);
  }
  if (stampModal) {
    stampModal.onclick = (e) => {
      if (e.target === stampModal) setStampModalOpen(stampModal, false);
    };
  }

  const postcardModal = document.getElementById('postcardModal');
  const postcardWrapper = document.getElementById('postcardWrapper');
  const btnFlipCard = document.getElementById('btnFlipCard');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const postcardCard = document.getElementById('postcardCard');

  if (postcardModal) {
    postcardModal.setAttribute('aria-hidden', 'true');
    postcardModal.onclick = (e) => {
      if (e.target === postcardModal || e.target === postcardWrapper) {
        closePostcardModal();
      }
    };
  }
  if (btnFlipCard) btnFlipCard.onclick = flipPostcard;
  if (btnCloseModal) btnCloseModal.onclick = closePostcardModal;
  if (postcardCard) {
    postcardCard.onpointerdown = (e) => {
      cardPointerDownPos = { x: e.clientX, y: e.clientY };
    };
    postcardCard.onclick = (e) => {
      if (e.target.closest('#regionalTabs')) return;
      const moveDist = Math.hypot(e.clientX - cardPointerDownPos.x, e.clientY - cardPointerDownPos.y);
      if (moveDist > 12) return;
      if (window.getSelection()?.toString()) return;
      flipPostcard();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePostcardModal();
      setDrawerOpen(bookletDrawer, false);
      setStampModalOpen(stampModal, false);
    }
  });
}

function initGlobeRocker() {
  const btnClassic = document.getElementById('btnEquinoxDrift');
  const btnLive = document.getElementById('btnLocalNoon');
  const readout = document.getElementById('telemetryReadout');
  let activeMode = 'drift';

  const updateUtc = () => {
    if (!readout) return;
    if (activeMode === 'realtime') {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      readout.textContent = `${hh}:${mm} UTC`;
      readout.classList.remove('hidden');
    } else {
      readout.classList.add('hidden');
    }
  };

  const setMode = (mode) => {
    activeMode = mode;
    if (btnClassic) btnClassic.classList.toggle('is-active', mode === 'drift');
    if (btnLive) btnLive.classList.toggle('is-active', mode === 'realtime');
    if (setGlobeModeRef) setGlobeModeRef(mode);
    updateUtc();
  };

  if (btnClassic) btnClassic.onclick = () => setMode('drift');
  if (btnLive) btnLive.onclick = () => setMode('realtime');

  if (utcTimer) clearInterval(utcTimer);
  utcTimer = setInterval(updateUtc, 10000);
}

function buildTravelJournalDrawer(gamesCatalog, onFlyToLocation) {
  const container = document.getElementById('gameVolumesList');
  container.innerHTML = '';

  let totalWaypointsCount = 0;

  gamesCatalog.forEach(vol => {
    const card = document.createElement('div');
    card.className = 'journal-volume-card';

    let locItemsHtml = '';
    vol.locations.forEach(loc => {
      if (loc.isRegion && loc.subLocations) {
        totalWaypointsCount += loc.subLocations.length;
        locItemsHtml += `
          <div class="mt-2 pt-2 border-t border-amber-500/15">
            <div class="flex items-center justify-between px-1 mb-1">
              <span class="text-[9.5px] font-mono journal-accent font-bold">Region • ${loc.city}</span>
              <button type="button" data-pin-id="${loc.id}" class="pin-toggle-chip" title="Toggle Pin on Globe" aria-label="Toggle ${loc.city} pin">
                ${PIN_SVG}
              </button>
            </div>
            <div class="space-y-1">
              ${loc.subLocations.map(sub => `
                <button type="button" data-loc-id="${loc.id}" data-sub-id="${sub.id}" class="journal-entry-btn journal-fly-btn">
                  <span class="text-xs font-semibold journal-text font-postcard-type truncate">✦ ${sub.city}</span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        totalWaypointsCount += 1;
        locItemsHtml += `
          <div class="journal-entry-row">
            <button type="button" data-loc-id="${loc.id}" class="journal-entry-btn journal-fly-btn">
              <span class="text-xs font-semibold journal-text font-postcard-type truncate">• ${loc.city}</span>
            </button>
            <button type="button" data-pin-id="${loc.id}" class="pin-toggle-chip" title="Toggle Pin on Globe" aria-label="Toggle ${loc.city} pin">
              ${PIN_SVG}
            </button>
          </div>
        `;
      }
    });

    const pinCountText = vol.locations.length === 1 ? '1 pin' : `${vol.locations.length} pins`;

    card.innerHTML = `
      <div class="journal-volume-header">
        <div>
          <h3 class="text-sm font-bold journal-text font-serif leading-snug">${vol.title}</h3>
          <p class="text-[10px] journal-text-muted font-postcard-type">${vol.subtitle || vol.franchise || ''}</p>
        </div>
        <span class="text-[9.5px] px-2 py-0.5 rounded-xs font-mono font-bold journal-card journal-accent border border-amber-500/30 shrink-0">${pinCountText}</span>
      </div>
      <div class="space-y-1.5">${locItemsHtml}</div>
    `;

    container.appendChild(card);
  });

  const totalLogsCounter = document.getElementById('totalLogsCounter');
  if (totalLogsCounter) {
    totalLogsCounter.textContent = `${totalWaypointsCount} logged`;
  }

  container.querySelectorAll('.journal-fly-btn').forEach(btn => {
    btn.onclick = () => {
      const locId = btn.getAttribute('data-loc-id');
      const subId = btn.getAttribute('data-sub-id');
      if (!pinnedIds.has(locId)) {
        pinnedIds.add(locId);
        savePinPreferences();
        syncPinStatesToGlobe();
      }
      setDrawerOpen(document.getElementById('bookletDrawer'), false);
      onFlyToLocation(locId, subId);
    };
  });

  container.querySelectorAll('.pin-toggle-chip').forEach(chip => {
    chip.onclick = (e) => {
      e.stopPropagation();
      const locId = chip.getAttribute('data-pin-id');
      if (pinnedIds.has(locId)) {
        pinnedIds.delete(locId);
      } else {
        pinnedIds.add(locId);
      }
      savePinPreferences();
      syncPinStatesToGlobe();
    };
  });
}

export function openPostcardModal(loc, subId = null) {
  currentActiveLoc = loc;
  if (setGlobeModalStateRef) setGlobeModalStateRef(true);

  const modal = document.getElementById('postcardModal');
  const wrapper = document.getElementById('postcardWrapper');
  const card = document.getElementById('postcardCard');
  const regionalTabs = document.getElementById('regionalTabs');
  const postcardBack = document.getElementById('postcardBack');

  card.classList.remove('rotate-y-180');
  postcardBack.className = "absolute inset-0 w-full h-full backface-hidden rotate-y-180 text-slate-900 rounded-md border-8 p-3 sm:p-5 flex flex-col justify-between shadow-2xl overflow-hidden transition-colors duration-300 " + (loc.themeClass || "theme-ac1");

  if (loc.isRegion && loc.subLocations && loc.subLocations.length > 0) {
    regionalTabs.classList.remove('hidden');
    regionalTabs.classList.add('flex');

    regionalTabs.innerHTML = loc.subLocations.map(sub => `
      <button id="tab-${sub.id}" class="sub-tab-btn" data-sub-id="${sub.id}">${sub.city}</button>
    `).join('');

    regionalTabs.querySelectorAll('.sub-tab-btn').forEach(tabBtn => {
      tabBtn.onclick = () => switchSubTab(tabBtn.getAttribute('data-sub-id'));
    });

    switchSubTab(subId || loc.subLocations[0].id);
  } else {
    regionalTabs.classList.add('hidden');
    regionalTabs.classList.remove('flex');
    renderCardData({
      city: loc.city,
      dispatchLocation: loc.dispatchLocation,
      modernLocation: loc.modernLocation,
      settingEra: loc.settingEra,
      quote: loc.quote,
      quoteContext: loc.quoteContext,
      spatialNote: loc.spatialNote,
      photo: loc.photo,
      ref: loc.ref,
      game: loc.game,
      tagline: loc.tagline,
      icon: loc.icon,
      lat: loc.coordinates.lat,
      lng: loc.coordinates.lng
    });
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.setAttribute('aria-hidden', 'false');
  wrapper.classList.remove('scale-75');
  wrapper.classList.add('scale-100');
}

function switchSubTab(subId) {
  if (!currentActiveLoc || !currentActiveLoc.subLocations) return;
  const sub = currentActiveLoc.subLocations.find(s => s.id === subId);
  if (!sub) return;

  currentActiveLoc.subLocations.forEach(s => {
    const btn = document.getElementById(`tab-${s.id}`);
    if (btn) btn.classList.toggle('is-active', s.id === subId);
  });

  renderCardData({
    city: sub.city,
    dispatchLocation: sub.dispatchLocation,
    modernLocation: sub.modernLocation,
    settingEra: sub.settingEra,
    quote: sub.quote,
    quoteContext: sub.quoteContext,
    spatialNote: sub.spatialNote,
    photo: sub.photo,
    ref: sub.ref,
    game: currentActiveLoc.game,
    tagline: `${sub.city} Dispatch • ${currentActiveLoc.city}`,
    icon: currentActiveLoc.icon,
    lat: sub.coordinates?.lat ?? currentActiveLoc.coordinates.lat,
    lng: sub.coordinates?.lng ?? currentActiveLoc.coordinates.lng
  });
}

function renderCardData(data) {
  document.getElementById('pcFrontImg').src = data.photo || FALLBACK_PHOTO;
  document.getElementById('pcGameBadge').textContent = data.game;
  document.getElementById('pcFrontLocation').textContent = data.dispatchLocation;
  document.getElementById('pcTitle').textContent = data.city;
  document.getElementById('pcTagline').textContent = data.tagline;

  const eraLabel = data.settingEra || '';
  document.getElementById('pcBackCity').textContent = data.city;
  document.getElementById('pcSettingHeader').textContent = eraLabel
    ? `${data.dispatchLocation} • (${eraLabel})`
    : data.dispatchLocation;
  document.getElementById('pcOriginSealEra').textContent = eraLabel.split(' ')[0] || 'Origin';

  document.getElementById('pcStampIcon').className = `fa-solid ${data.icon || 'fa-landmark'} text-xs sm:text-sm mt-0.5 text-amber-300`;
  document.getElementById('pcStampValue').textContent = data.city.substring(0, 4);

  document.getElementById('pcQuote').textContent = `"${data.quote}"`;
  document.getElementById('pcQuoteContext').textContent = `— ${data.quoteContext}`;
  document.getElementById('pcSpatialNote').textContent = data.spatialNote;

  document.getElementById('pcMetaGame').textContent = data.game;
  document.getElementById('pcMetaEra').textContent = eraLabel || '—';
  document.getElementById('pcMetaReal').textContent = data.modernLocation;

  const latHem = data.lat >= 0 ? 'N' : 'S';
  const lngHem = data.lng >= 0 ? 'E' : 'W';
  document.getElementById('pcMetaCoords').textContent =
    `${Math.abs(data.lat).toFixed(4)}° ${latHem}, ${Math.abs(data.lng).toFixed(4)}° ${lngHem}`;

  document.getElementById('pcRefId').textContent = data.ref;
}

function flipPostcard() {
  document.getElementById('postcardCard').classList.toggle('rotate-y-180');
}

function closePostcardModal() {
  const modal = document.getElementById('postcardModal');
  const wrapper = document.getElementById('postcardWrapper');
  const card = document.getElementById('postcardCard');

  wrapper.classList.remove('scale-100');
  wrapper.classList.add('scale-75');
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.setAttribute('aria-hidden', 'true');

  if (setGlobeModalStateRef) setGlobeModalStateRef(false);
  setTimeout(() => card.classList.remove('rotate-y-180'), 300);
}
