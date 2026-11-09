let currentActiveLoc = null;
let setGlobeModalStateRef = null;

export function initUI(gamesCatalog, onFlyToLocation, setGlobeModalState) {
  setGlobeModalStateRef = setGlobeModalState;
  buildTravelJournalDrawer(gamesCatalog, onFlyToLocation);

  const albumToggle = document.getElementById('albumToggle');
  const bookletDrawer = document.getElementById('bookletDrawer');
  const drawerClose = document.getElementById('drawerClose');

  if (albumToggle) {
    albumToggle.onclick = (e) => {
      e.stopPropagation();
      bookletDrawer.classList.toggle('is-open');
    };
  }
  if (drawerClose) {
    drawerClose.onclick = () => bookletDrawer.classList.remove('is-open');
  }

  const stampToggle = document.getElementById('stampToggle');
  const stampModal = document.getElementById('stampModal');
  const stampClose = document.getElementById('stampClose');

  if (stampToggle) {
    stampToggle.onclick = () => stampModal.classList.add('is-open');
  }
  if (stampClose) {
    stampClose.onclick = () => stampModal.classList.remove('is-open');
  }
  if (stampModal) {
    stampModal.onclick = (e) => {
      if (e.target === stampModal) stampModal.classList.remove('is-open');
    };
  }

  const btnFlipCard = document.getElementById('btnFlipCard');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const postcardCard = document.getElementById('postcardCard');

  if (btnFlipCard) btnFlipCard.onclick = flipPostcard;
  if (btnCloseModal) btnCloseModal.onclick = closePostcardModal;
  if (postcardCard) {
    postcardCard.onclick = (e) => {
      if (!e.target.closest('#regionalTabs')) flipPostcard();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePostcardModal();
      bookletDrawer.classList.remove('is-open');
      stampModal.classList.remove('is-open');
    }
  });
}

function buildTravelJournalDrawer(gamesCatalog, onFlyToLocation) {
  const container = document.getElementById('gameVolumesList');
  container.innerHTML = '';

  gamesCatalog.forEach(vol => {
    const card = document.createElement('div');
    card.className = 'journal-volume-card';
    
    let locItemsHtml = '';
    vol.locations.forEach(loc => {
      if (loc.isRegion && loc.subLocations) {
        locItemsHtml += `
          <div class="mt-2 pt-2 border-t border-amber-900/30">
            <span class="text-[9px] font-mono text-amber-400/90 font-bold uppercase block px-2 mb-1">REGIONAL BOOKLET • ${loc.city.toUpperCase()}</span>
            <div class="space-y-1">
              ${loc.subLocations.map(sub => `
                <button data-loc-id="${loc.id}" data-sub-id="${sub.id}" class="journal-entry-btn journal-fly-btn">
                  <span class="text-xs font-semibold text-amber-100 font-postcard-type">✦ ${sub.city}</span>
                  <span class="text-[9px] text-amber-300/60 font-mono">${sub.settingEra}</span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        locItemsHtml += `
          <button data-loc-id="${loc.id}" class="journal-entry-btn journal-fly-btn">
            <span class="text-xs font-semibold text-amber-100 font-postcard-type">• ${loc.city}</span>
            <span class="text-[9px] text-amber-300/60 font-mono">${loc.settingEra || 'Modern'}</span>
          </button>
        `;
      }
    });

    card.innerHTML = `
      <div class="journal-volume-header">
        <div>
          <span class="journal-volume-tag">${vol.volNum}</span>
          <h3 class="text-sm font-bold text-amber-100 font-cinzel leading-snug">${vol.title}</h3>
          <p class="text-[10px] text-amber-200/60 font-postcard-type">${vol.franchise}</p>
        </div>
        <span class="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/40">${vol.locations.length} LOGS</span>
      </div>
      <div class="space-y-1">${locItemsHtml}</div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll('.journal-fly-btn').forEach(btn => {
    btn.onclick = () => {
      const locId = btn.getAttribute('data-loc-id');
      const subId = btn.getAttribute('data-sub-id');
      document.getElementById('bookletDrawer').classList.remove('is-open');
      onFlyToLocation(locId, subId);
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
  postcardBack.className = "absolute inset-0 w-full h-full backface-hidden rotate-y-180 text-slate-900 rounded-2xl border-8 p-3 sm:p-5 flex flex-col justify-between shadow-2xl overflow-hidden transition-colors duration-300 " + (loc.themeClass || "theme-ac1");

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
    lat: currentActiveLoc.coordinates.lat,
    lng: currentActiveLoc.coordinates.lng
  });
}

function renderCardData(data) {
  document.getElementById('pcFrontImg').src = data.photo;
  document.getElementById('pcGameBadge').textContent = data.game;
  document.getElementById('pcFrontLocation').textContent = data.dispatchLocation;
  document.getElementById('pcTitle').textContent = data.city;
  document.getElementById('pcTagline').textContent = data.tagline;

  document.getElementById('pcBackCity').textContent = data.city;
  document.getElementById('pcSettingHeader').textContent = `${data.dispatchLocation} • (${data.settingEra})`;
  document.getElementById('pcOriginSealEra').textContent = data.settingEra.split(' ')[0] || '1191 AD';

  document.getElementById('pcStampIcon').className = `fa-solid ${data.icon || 'fa-landmark'} text-xs sm:text-sm mt-0.5 text-amber-300`;
  document.getElementById('pcStampValue').textContent = data.city.substring(0, 4).toUpperCase();

  document.getElementById('pcQuote').textContent = `"${data.quote}"`;
  document.getElementById('pcQuoteContext').textContent = `— ${data.quoteContext}`;
  document.getElementById('pcSpatialNote').textContent = data.spatialNote;

  document.getElementById('pcMetaGame').textContent = data.game;
  document.getElementById('pcMetaEra').textContent = data.settingEra;
  document.getElementById('pcMetaReal').textContent = data.modernLocation;
  document.getElementById('pcMetaCoords').textContent = `${data.lat.toFixed(4)}° N, ${data.lng.toFixed(4)}° E`;

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

  if (setGlobeModalStateRef) setGlobeModalStateRef(false);
  setTimeout(() => card.classList.remove('rotate-y-180'), 300);
}
