import './popup.css';
import { HDR_BRIGHTNESS } from '../shared/hdr.js';

// Same key content.js uses — keeps the extension's original name
const SETTINGS_KEY = 'hdrDimmerSettings';

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
const channelRow     = $('channelRow');
const channelHint    = $('channelHint');
const channelToggle  = $('channelToggle');
const keptList       = $('keptList');
const keptItems      = $('keptItems');

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
// Status icons are <symbol>s in popup.html (#i-<kind>)
const ICON_KINDS = ['blocked', 'dimming', 'force', 'allowed', 'sdr', 'off', 'idle'];

function setStatus(kind, title, sub) {
  statusCard.className = `status ${kind}`;
  statusIcon.querySelector('use').setAttribute('href', `#i-${ICON_KINDS.includes(kind) ? kind : 'idle'}`);
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

function applyState({ isHDR, hdrType, blockedType, recommendedBrightness, effectiveBrightness: eb, settings,
                      channelId, channelName, channelAllowed }) {
  const enabled = settings.enabled;
  const auto    = settings.autoBrightness ?? true;
  const force   = settings.forceApply ?? false;
  const blocked = !isHDR && !!blockedType;
  const info    = HDR_NAMES[isHDR ? hdrType : blockedType] || null;
  const pct     = eb ?? settings.brightness;
  const kept    = enabled && isHDR && channelAllowed; // HDR left as YouTube serves it
  const dimming = enabled && !kept && (isHDR || force);

  document.body.classList.toggle('ext-off', !enabled);
  powerToggle.checked = enabled;
  forceToggle.checked = force;

  // status card — short title, details in the subtitle
  if (!enabled) {
    setStatus('off', 'Paused', 'HDR videos play at full brightness');
  } else if (isHDR && channelAllowed) {
    setStatus('allowed', 'HDR kept', `${channelName || 'This channel'} is on your HDR list`);
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

  // "Keep HDR for this channel" — offered on videos that have HDR
  channelRow.hidden = !(enabled && channelId && (isHDR || blocked || channelAllowed));
  channelToggle.checked = !!channelAllowed;
  channelHint.textContent = channelName || 'Never blocked or dimmed';
  renderKept(settings.allowedChannels);

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

  if (kept) {
    brightnessHint.textContent = 'Not applied — this channel keeps HDR.';
  } else if (auto && recommendedBrightness) {
    const calc = hdrType === 'HLG'
      ? `(100/203)^(1/2.2) = ${recommendedBrightness}%`
      : `(100/203)^(1/2.2) − 4 = ${recommendedBrightness}%`;
    const detail = document.createElement('small');
    detail.textContent = `ITU-R BT.2100 · ${calc}`;
    brightnessHint.replaceChildren('Matched to standard-video white level.', detail);
  } else if (auto) {
    brightnessHint.textContent =
      `Picks ${HDR_BRIGHTNESS.HLG}% for Broadcast HDR and ${HDR_BRIGHTNESS.PQ}% for HDR10 when one plays.`;
  } else if (!dimming) {
    brightnessHint.textContent = 'Used when an HDR video plays and can’t be blocked.';
  } else {
    brightnessHint.textContent = '';
  }
}

// Channels whose HDR is kept, with a remove button each
function renderKept(channels = []) {
  keptList.hidden = !channels.length;
  keptItems.replaceChildren(...channels.map(c => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = c.name || c.id;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = remove.ariaLabel = `Stop keeping HDR for ${c.name || c.id}`;
    remove.addEventListener('click', () => removeKept(c.id));
    li.append(name, remove);
    return li;
  }));
}

// Written straight to storage so it also works away from YouTube; open
// YouTube tabs pick the change up through storage.onChanged
function removeKept(id) {
  chrome.storage.local.get(SETTINGS_KEY, res => {
    const s = res[SETTINGS_KEY] || {};
    s.allowedChannels = (s.allowedChannels || []).filter(c => c.id !== id);
    chrome.storage.local.set({ [SETTINGS_KEY]: s }, () => { renderKept(s.allowedChannels); loadStatus(); });
  });
}

function loadStatus() {
  sendToContent({ type: 'GET_STATUS' }, (res, tab) => {
    if (!res) {
      const onYouTube = tab && /^https?:\/\/www\.youtube\.com\//.test(tab.url || '');
      setStatus('idle',
        onYouTube ? 'Reload this tab' : 'Open a YouTube video',
        onYouTube ? 'It was opened before the extension loaded' : 'YouTube HDR Cleaner works on youtube.com');
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

channelToggle.addEventListener('change', () => {
  sendToContent({ type: 'SET_CHANNEL_ALLOWED', value: channelToggle.checked }, loadStatus);
});

forceToggle.addEventListener('change', () => {
  sendToContent({ type: 'SET_FORCE_APPLY', value: forceToggle.checked }, loadStatus);
});

// ── Live push from content script ─────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'STATUS_UPDATE') applyState(msg);
});

// ── Init ─────────────────────────────────────────────────────────────────
chrome.storage.local.get(SETTINGS_KEY, res => renderKept((res[SETTINGS_KEY] || {}).allowedChannels));
document.querySelector('.brand-ver').textContent = `v${chrome.runtime.getManifest().version}`;
setStatus('idle', 'Checking…', '');
setTrack(+slider.value);
loadStatus();
loadStats();
