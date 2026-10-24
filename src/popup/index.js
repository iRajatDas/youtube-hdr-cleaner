import './popup.css';
import { HDR_BRIGHTNESS } from '../shared/hdr.js';

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const powerToggle    = $('powerToggle');
const statusCard     = $('statusCard');
const statusIcon     = $('statusIcon');
const statusTitle    = $('statusTitle');
const statusSub      = $('statusSub');
const hdrBadge       = $('hdrBadge');
const modeAuto       = $('modeAuto');
const modeManual     = $('modeManual');
const slider         = $('slider');
const bval           = $('bval');
const brightnessHint = $('brightnessHint');
const brightnessSec  = $('brightnessSec');
const forceToggle    = $('forceToggle');

// stats
const statVideos = $('statVideos');
const statTime   = $('statTime');
const statToday  = $('statToday');
const hlgBar     = $('hlgBar');
const pqBar      = $('pqBar');
const hlgCount   = $('hlgCount');
const pqCount    = $('pqCount');
const comfortVal = $('comfortVal');
const comfortSub = $('comfortSub');

// ── Icons (Lucide-style strokes) ──────────────────────────────────────────
const ICONS = {
  blocked: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  dimming: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  force:   '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sdr:     '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  off:     '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  idle:    '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
};

function setStatus(kind, title, sub) {
  statusCard.className = `status ${kind}`;
  statusIcon.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[kind] || ICONS.idle}</svg>`;
  statusTitle.textContent = title;
  statusSub.textContent   = sub;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtTime(s) {
  if (!s || s < 5)  return '—';
  if (s < 60)       return '<1m';
  const m = Math.floor(s / 60);
  if (m < 60)       return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

const fmtNum = n => (n || 0).toLocaleString();

function setTrack(val) {
  const pct = ((val - 20) / 80) * 100;
  slider.style.background =
    `linear-gradient(to right,var(--accent) ${pct}%,var(--border2) ${pct}%)`;
}

function showBrightness(v) {
  slider.value = v;
  bval.textContent = `${v}%`;
  setTrack(v);
}

// cb receives null when the tab has no content script (not YouTube, or
// opened before the extension was installed/reloaded)
function sendToContent(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) { cb && cb(null, null); return; }
    chrome.tabs.sendMessage(tabs[0].id, msg, res => {
      if (chrome.runtime.lastError) { cb && cb(null, tabs[0]); return; }
      cb && cb(res, tabs[0]);
    });
  });
}

// ── Status UI ─────────────────────────────────────────────────────────────
// Human-readable labels for what are otherwise opaque codec terms
const HDR_NAMES = {
  HLG: { display: 'Broadcast HDR',        badge: 'HLG',   badgeCls: 'hlg' },
  PQ:  { display: 'HDR10 / Dolby Vision', badge: 'HDR10', badgeCls: 'pq'  },
};

function applyState({ isHDR, hdrType, blockedType, recommendedBrightness, effectiveBrightness: eb, settings }) {
  const enabled = settings.enabled;
  const auto    = settings.autoBrightness ?? true;
  const force   = settings.forceApply ?? false;
  const blocked = !isHDR && !!blockedType;
  const info    = HDR_NAMES[isHDR ? hdrType : blockedType] || null;
  const pct     = eb ?? settings.brightness;
  const dimming = enabled && (isHDR || force);

  document.body.classList.toggle('ext-off', !enabled);
  powerToggle.checked = enabled;
  forceToggle.checked = force;

  // status card — short title, details in the subtitle
  if (!enabled) {
    setStatus('off', 'Paused', 'HDR videos play at full brightness');
  } else if (isHDR) {
    setStatus(force ? 'force' : 'dimming', 'Dimming HDR video',
      `${info ? info.display : 'HDR'} · ${pct}% brightness`);
  } else if (force) {
    setStatus('force', 'Dimming every video', `${pct}% brightness`);
  } else if (blocked) {
    setStatus('blocked', 'HDR blocked', 'Playing the standard version — nothing to dim');
  } else {
    setStatus('sdr', 'Standard video', 'Nothing to adjust');
  }

  if (enabled && (isHDR || blocked) && info) {
    hdrBadge.textContent = info.badge;
    hdrBadge.className   = `badge ${info.badgeCls}`;
    hdrBadge.hidden = false;
  } else {
    hdrBadge.hidden = true;
  }

  // brightness — Auto only has a value once an HDR type is known
  modeAuto.checked   = auto;
  modeManual.checked = !auto;
  slider.disabled    = auto;
  showBrightness(pct);
  // nothing to show until an HDR type is known — hide the readout and slider
  const pending = auto && !recommendedBrightness;
  brightnessSec.classList.toggle('pending', pending);
  if (pending) bval.textContent = '';

  if (auto && recommendedBrightness) {
    const calc = hdrType === 'HLG'
      ? `(100/203)^(1/2.2) = ${recommendedBrightness}%`
      : `(100/203)^(1/2.2) − 4 = ${recommendedBrightness}%`;
    brightnessHint.innerHTML =
      `Matched to standard-video white level.<small>ITU-R BT.2100 · ${calc}</small>`;
  } else if (auto) {
    brightnessHint.textContent =
      `Picks ${HDR_BRIGHTNESS.HLG}% for Broadcast HDR and ${HDR_BRIGHTNESS.PQ}% for HDR10 when one plays.`;
  } else if (!dimming) {
    brightnessHint.textContent = 'Used when an HDR video plays and can’t be blocked.';
  } else {
    brightnessHint.textContent = '';
  }
}

function loadStatus() {
  sendToContent({ type: 'GET_STATUS' }, (res, tab) => {
    if (!res) {
      const onYouTube = tab && /^https?:\/\/www\.youtube\.com\//.test(tab.url || '');
      setStatus('idle',
        onYouTube ? 'Reload this tab' : 'Open a YouTube video',
        onYouTube ? 'It was opened before the extension loaded' : 'HDR Dimmer works on youtube.com');
      hdrBadge.hidden = true;
      return;
    }
    applyState(res);
  });
}

// ── Stats UI ──────────────────────────────────────────────────────────────
function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, stats => {
    if (chrome.runtime.lastError || !stats) return;

    statVideos.textContent = fmtNum(stats.totalVideos);
    statTime.textContent   = fmtTime(stats.totalSeconds);
    statToday.textContent  = fmtNum(stats.todayVideos);

    const hlg = stats.hlgCount || 0, pq = stats.pqCount || 0;
    const total = hlg + pq;
    hlgBar.style.width = total ? `${(hlg / total) * 100}%` : '0';
    pqBar.style.width  = total ? `${(pq / total) * 100}%`  : '0';
    hlgCount.textContent = fmtNum(hlg);
    pqCount.textContent  = fmtNum(pq);

    // Eye comfort metric
    // Luminance delta removed = 103 nits (203 HDR ref − 100 SDR ref)
    // Comfort = that delta × dimming hours
    const nitHrs = Math.round((103 * (stats.totalSeconds || 0)) / 3600);
    if (nitHrs >= 1) {
      comfortVal.textContent = `≈${fmtNum(nitHrs)} nit-hours of glare avoided`;
      comfortSub.textContent = '103 nits above standard white × time dimmed';
    } else {
      comfortVal.textContent = 'No data yet';
      comfortSub.textContent = 'Watch an HDR video to start tracking';
    }
  });
}

// ── Events ────────────────────────────────────────────────────────────────
powerToggle.addEventListener('change', () => {
  sendToContent({ type: 'SET_ENABLED', value: powerToggle.checked }, loadStatus);
});

function setMode(auto) {
  slider.disabled = auto;
  sendToContent({ type: 'SET_AUTO_BRIGHTNESS', value: auto }, loadStatus);
}
modeAuto.addEventListener('change',   () => setMode(true));
modeManual.addEventListener('change', () => setMode(false));

let debounce = null;
slider.addEventListener('input', () => {
  const v = +slider.value;
  showBrightness(v);
  clearTimeout(debounce);
  debounce = setTimeout(() =>
    sendToContent({ type: 'SET_BRIGHTNESS', value: v }, loadStatus)
  , 60);
});

forceToggle.addEventListener('change', () => {
  sendToContent({ type: 'SET_FORCE_APPLY', value: forceToggle.checked }, loadStatus);
});

// ── Live push from content script ─────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'STATUS_UPDATE') applyState(msg);
});

// ── Init ─────────────────────────────────────────────────────────────────
document.querySelector('.brand-ver').textContent = `v${chrome.runtime.getManifest().version}`;
setStatus('idle', 'Checking…', '');
setTrack(+slider.value);
loadStatus();
loadStats();
