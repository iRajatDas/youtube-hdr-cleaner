import { HDR_BRIGHTNESS, EVT_STATE, EVT_REQUEST, EVT_BLOCK, EVT_RELOAD, BLOCK_KEY } from '../shared/hdr.js';

// Storage keys keep the extension's original name so existing settings survive
const STORAGE_KEY     = 'hdrDimmerSettings';
const FILTER_STYLE_ID = 'hdr-cleaner-style';
const OVERLAY_SELECTOR = '#movie_player::after,#shorts-player::after';

let settings = { enabled: true, brightness: 75, autoBrightness: true, forceApply: false };
let settingsLoaded = false;

// Latest result pushed by page.js (MAIN world)
let videoId = null;
let isHDR   = false;
let hdrType = null;
let blockedType = null; // HDR type blocker.js swapped for SDR on this video
let recommendedBrightness = null;

let lastCss    = null;
let lastStatus = '';

// Stats state
let dimmingStartTime = null;
let trackingVideoId  = null;
let trackedBlockedId = null;

// ── Extension context guard ────────────────────────────────────────────────
// After an extension reload the injected content script keeps running, but
// chrome.runtime becomes invalid and any API call throws "Extension context
// invalidated". Chrome logs this at runtime level EVEN WHEN caught in JS.
//
// Defence strategy: check chrome.runtime.id BEFORE every API call.
// When invalid, .id is `undefined` (not a throw), so we can safely gate on it
// without generating the logged error in the first place.
let contextAlive = true;

function isContextAlive() {
  try {
    // runtime.id is undefined (not a throw) when the context is invalidated.
    if (!chrome.runtime || !chrome.runtime.id) contextAlive = false;
  } catch (_) {
    contextAlive = false;
  }
  return contextAlive;
}

function runtimeSend(msg, cb) {
  if (!contextAlive || !isContextAlive()) return;
  try {
    chrome.runtime.sendMessage(msg, response => {
      // Swallow expected lastErrors (e.g. popup closed) — not bugs.
      if (chrome.runtime.lastError) {
        if ((chrome.runtime.lastError.message || '').includes('context invalidated'))
          contextAlive = false;
        return;
      }
      cb && cb(response);
    });
  } catch (_) {
    // Synchronous throw from sendMessage — mark dead and stop.
    contextAlive = false;
  }
}

// ── Storage ────────────────────────────────────────────────────────────────
function loadSettings(cb) {
  if (!isContextAlive()) { cb && cb(); return; }
  try {
    chrome.storage.local.get(STORAGE_KEY, result => {
      if (!chrome.runtime.lastError && result[STORAGE_KEY])
        settings = { ...settings, ...result[STORAGE_KEY] };
      cb && cb();
    });
  } catch (_) { cb && cb(); }
}

// Mirror `enabled` for blocker.js: localStorage for the next page load, an
// event for the hooks already running. A toggle mid-video reloads it so the
// stream follows: on swaps a dimmed HDR stream for SDR, off restores HDR.
let blockFlag = null;
function syncBlockFlag() {
  const flag = settings.enabled ? '1' : '0';
  if (flag === blockFlag) return;
  const prev = blockFlag;
  blockFlag = flag;
  try { localStorage.setItem(BLOCK_KEY, flag); } catch (_) {}
  document.dispatchEvent(new CustomEvent(EVT_BLOCK, { detail: flag }));
  if (prev === null) return; // initial sync, not a toggle
  if (flag === '1' ? isHDR : blockedType) document.dispatchEvent(new CustomEvent(EVT_RELOAD));
}

function saveSettings() {
  syncBlockFlag();
  if (!contextAlive || !isContextAlive()) return;
  try { chrome.storage.local.set({ [STORAGE_KEY]: settings }); } catch (_) {}
}

// ── Effective brightness ───────────────────────────────────────────────────
function effectiveBrightness() {
  return (settings.autoBrightness && recommendedBrightness)
    ? recommendedBrightness
    : settings.brightness;
}

// ── Stats tracking ─────────────────────────────────────────────────────────
// Counts time while an HDR video is actually being dimmed; restarts per video.
function syncTracking(active = settings.enabled && isHDR) {
  const next = active ? videoId : null;
  if (next === trackingVideoId) return;

  if (dimmingStartTime) {
    const seconds = Math.round((Date.now() - dimmingStartTime) / 1000);
    if (seconds > 4) runtimeSend({ type: 'TRACK_DIMMING_END', seconds });
  }
  trackingVideoId  = next;
  dimmingStartTime = next ? Date.now() : null;
  if (next) runtimeSend({ type: 'TRACK_HDR_VIEW', videoId: next, hdrType });
}

// A blocked video counts as tamed, but adds no dimming time
function trackBlocked() {
  if (!settings.enabled || !blockedType || !videoId || videoId === trackedBlockedId) return;
  trackedBlockedId = videoId;
  runtimeSend({ type: 'TRACK_HDR_VIEW', videoId, hdrType: blockedType });
}

// ── Filter ─────────────────────────────────────────────────────────────────
function getOrCreateStyleTag() {
  let tag = document.getElementById(FILTER_STYLE_ID);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = FILTER_STYLE_ID;
    (document.head || document.documentElement).appendChild(tag);
  }
  return tag;
}

function applyFilter() {
  if (!settingsLoaded) return;
  const shouldDim = settings.enabled && (isHDR || settings.forceApply);

  // Dim with a black layer over the video instead of `filter` on the <video>.
  // Black at alpha a composited over a pixel gives c·(1−a) — the same result
  // as brightness(1−a) — but the video keeps its hardware overlay path. A
  // filter forces every HDR frame through a GPU filter pass, which stutters
  // the whole page on HDR displays. z-index 10 + being the last child puts it
  // above .html5-video-container (z 10) and below captions/controls (z ≥ 25).
  // The rule stays declared at opacity 0 when not dimming so changes fade.
  const opacity = shouldDim ? +(1 - effectiveBrightness() / 100).toFixed(3) : 0;
  const css = `${OVERLAY_SELECTOR}{content:"";position:absolute;inset:0;z-index:10;` +
              `background:#000;opacity:${opacity};pointer-events:none;transition:opacity .3s ease}`;

  // Only touch the DOM when the rule actually changes — avoids needless
  // style recalcs and repaints of the video layer
  const tag = getOrCreateStyleTag();
  if (css !== lastCss || tag.textContent !== css) {
    tag.textContent = css;
    lastCss = css;
  }

  syncTracking();
  trackBlocked();
  notifyStatus();
}

function currentStatus() {
  return { isHDR, hdrType, blockedType, recommendedBrightness,
           effectiveBrightness: effectiveBrightness(), settings };
}

function notifyStatus() {
  const status = currentStatus();
  const json = JSON.stringify(status);
  if (json === lastStatus) return;
  lastStatus = json;
  runtimeSend({ type: 'STATUS_UPDATE', ...status });
}

// ── HDR state from page.js ─────────────────────────────────────────────────
document.addEventListener(EVT_STATE, e => {
  let s;
  try { s = JSON.parse(e.detail); } catch (_) { return; }
  videoId = s.videoId || null;
  isHDR   = !!s.isHDR;
  hdrType = s.hdrType || null;
  blockedType = s.blockedType || null;
  recommendedBrightness = hdrType ? HDR_BRIGHTNESS[hdrType] : null;
  applyFilter();
});

// ── Message handling (from popup) ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATUS':
      sendResponse(currentStatus());
      break;
    case 'SET_ENABLED':
      settings.enabled = msg.value;
      saveSettings(); applyFilter();
      sendResponse({ ok: true });
      break;
    case 'SET_BRIGHTNESS':
      settings.brightness     = msg.value;
      settings.autoBrightness = false;
      saveSettings(); applyFilter();
      sendResponse({ ok: true });
      break;
    case 'SET_AUTO_BRIGHTNESS':
      settings.autoBrightness = msg.value;
      saveSettings(); applyFilter();
      sendResponse({ ok: true, effectiveBrightness: effectiveBrightness() });
      break;
    case 'SET_FORCE_APPLY':
      settings.forceApply = msg.value;
      saveSettings(); applyFilter();
      sendResponse({ ok: true });
      break;
  }
  return true;
});

// Keep other open YouTube tabs in sync when settings change elsewhere
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY] || !changes[STORAGE_KEY].newValue) return;
  settings = { ...settings, ...changes[STORAGE_KEY].newValue };
  syncBlockFlag();
  applyFilter();
});

// Flush dimming time when the tab is closed or navigated away
window.addEventListener('pagehide', () => syncTracking(false));

// ── Init ───────────────────────────────────────────────────────────────────
loadSettings(() => {
  settingsLoaded = true;
  syncBlockFlag();
  applyFilter();
  // Ask page.js to re-send its current state in case we missed it
  document.dispatchEvent(new CustomEvent(EVT_REQUEST));
});
