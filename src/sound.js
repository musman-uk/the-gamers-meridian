const STORAGE_KEY_MUTED = 'gm_sound_muted_v1';

let audioCtx = null;
let masterGain = null;
let noiseBuffer = null;
let isMutedState = loadMutePreference();

function loadMutePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
  } catch {
    return false;
  }
}

function saveMutePreference(muted) {
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, String(muted));
  } catch {
    // Ignore storage quota or privacy mode errors
  }
}

function ensureAudioGraph() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(audioCtx.destination);
  }
  return true;
}

function unlockOnFirstGesture() {
  const unlock = () => {
    if (ensureAudioGraph() && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });
}

if (typeof window !== 'undefined') {
  unlockOnFirstGesture();
}

function withContext(playFn) {
  if (isMutedState) return;
  if (!ensureAudioGraph()) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
      .then(() => {
        if (!isMutedState) playFn(audioCtx, masterGain);
      })
      .catch(() => {});
    return;
  }

  playFn(audioCtx, masterGain);
}

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.3);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function playTone(ctx, dest, {
  type = 'triangle',
  freqStart = 520,
  freqEnd = 360,
  duration = 0.06,
  gainPeak = 0.16,
  delay = 0
}) {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration + 0.015);
}

function playFilteredNoise(ctx, dest, {
  filterType = 'bandpass',
  freqStart = 1100,
  freqEnd = 1900,
  q = 1.2,
  duration = 0.11,
  gainPeak = 0.2,
  delay = 0
}) {
  const now = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
  }
  filter.Q.value = q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.014, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  source.start(now);
  source.stop(now + duration + 0.015);
}

export const SoundFX = {
  isMuted() {
    return isMutedState;
  },

  toggleMute() {
    isMutedState = !isMutedState;
    saveMutePreference(isMutedState);
    if (!isMutedState) {
      this.click();
    }
    return isMutedState;
  },

  // Crisp brass detent for buttons and regional tabs
  click() {
    withContext((ctx, dest) => {
      playTone(ctx, dest, {
        type: 'triangle',
        freqStart: 580,
        freqEnd: 320,
        duration: 0.055,
        gainPeak: 0.18
      });
      playTone(ctx, dest, {
        type: 'sine',
        freqStart: 1480,
        freqEnd: 980,
        duration: 0.025,
        gainPeak: 0.08
      });
    });
  },

  // Archival cardstock swish when opening or flipping a postcard
  flip() {
    withContext((ctx, dest) => {
      playFilteredNoise(ctx, dest, {
        filterType: 'bandpass',
        freqStart: 780,
        freqEnd: 2200,
        q: 1.1,
        duration: 0.125,
        gainPeak: 0.24
      });
      playTone(ctx, dest, {
        type: 'triangle',
        freqStart: 270,
        freqEnd: 150,
        duration: 0.065,
        gainPeak: 0.12,
        delay: 0.025
      });
    });
  },

  // Soft folio slide for the Travel Journal drawer
  drawer(opening = true) {
    withContext((ctx, dest) => {
      playFilteredNoise(ctx, dest, {
        filterType: 'lowpass',
        freqStart: opening ? 380 : 860,
        freqEnd: opening ? 940 : 320,
        q: 0.85,
        duration: 0.145,
        gainPeak: 0.21
      });
      playTone(ctx, dest, {
        type: 'sine',
        freqStart: opening ? 205 : 265,
        freqEnd: opening ? 285 : 180,
        duration: 0.09,
        gainPeak: 0.12
      });
    });
  },

  // Brass pin latch toggle on the globe
  pin(pinned = true) {
    withContext((ctx, dest) => {
      if (pinned) {
        playTone(ctx, dest, {
          type: 'triangle',
          freqStart: 820,
          freqEnd: 1180,
          duration: 0.055,
          gainPeak: 0.17
        });
        playTone(ctx, dest, {
          type: 'sine',
          freqStart: 1560,
          freqEnd: 1460,
          duration: 0.08,
          gainPeak: 0.1,
          delay: 0.025
        });
      } else {
        playTone(ctx, dest, {
          type: 'triangle',
          freqStart: 620,
          freqEnd: 340,
          duration: 0.06,
          gainPeak: 0.15
        });
      }
    });
  },

  // Mechanical rocker switch for Classic / Live globe mode
  rocker(mode = 'drift') {
    withContext((ctx, dest) => {
      const isLive = mode === 'realtime';
      playTone(ctx, dest, {
        type: 'triangle',
        freqStart: isLive ? 450 : 610,
        freqEnd: isLive ? 700 : 390,
        duration: 0.06,
        gainPeak: 0.18
      });
      playFilteredNoise(ctx, dest, {
        filterType: 'bandpass',
        freqStart: 1600,
        freqEnd: 1200,
        q: 1.5,
        duration: 0.028,
        gainPeak: 0.12
      });
    });
  },

  // Gentle paper settle when closing modals
  modalClose() {
    withContext((ctx, dest) => {
      playFilteredNoise(ctx, dest, {
        filterType: 'lowpass',
        freqStart: 680,
        freqEnd: 240,
        q: 0.8,
        duration: 0.095,
        gainPeak: 0.17
      });
      playTone(ctx, dest, {
        type: 'sine',
        freqStart: 240,
        freqEnd: 155,
        duration: 0.055,
        gainPeak: 0.09
      });
    });
  }
};
