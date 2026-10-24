import { setIconState, stateFromStatus } from './icon.js';

// ── Stats ─────────────────────────────────────────────────────────────────
// Keeps the extension's original name so existing stats survive
const STATS_KEY = 'hdrDimmerStats';
const DEFAULT_STATS = {
  totalVideos:   0,
  totalSeconds:  0,
  hlgCount:      0,
  pqCount:       0,
  seenVideoIds:  [],
  todayKey:      '',
  todayVideos:   0,
};

function loadStats() {
  return new Promise(resolve =>
    chrome.storage.local.get(STATS_KEY, res =>
      resolve({ ...DEFAULT_STATS, ...(res[STATS_KEY] || {}) })
    )
  );
}

function saveStats(stats) {
  return chrome.storage.local.set({ [STATS_KEY]: stats });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Toolbar icon ──────────────────────────────────────────────────────────
// The default icon follows the on/off setting; YouTube tabs override it with
// their own state from STATUS_UPDATE (sent by content.js on every change).
const SETTINGS_KEY = 'hdrDimmerSettings';
let defaultState = 'on';

function applyDefaultIcon(settings) {
  defaultState = settings && settings.enabled === false ? 'off' : 'on';
  setIconState(defaultState);
}

chrome.storage.local.get(SETTINGS_KEY, res => applyDefaultIcon(res[SETTINGS_KEY]));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) applyDefaultIcon(changes[SETTINGS_KEY].newValue);
});

// Leaving YouTube drops the tab's state. In-app YouTube navigations keep it
// (content.js reports changes itself); info.url is only visible to us on
// YouTube, so an unknown url means another site or a full reload, after
// which content.js re-reports anyway.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && !/^https?:\/\/www\.youtube\.com\//.test(info.url || ''))
    setIconState(defaultState, tabId);
});

// ── Keyboard shortcut ─────────────────────────────────────────────────────
// Flips `enabled` in storage; YouTube tabs follow through storage.onChanged
// (and reload the current video so blocking or HDR takes effect).
chrome.commands.onCommand.addListener(command => {
  if (command !== 'toggle-enabled') return;
  chrome.storage.local.get(SETTINGS_KEY, res => {
    const settings = res[SETTINGS_KEY] || {};
    chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, enabled: settings.enabled === false } });
  });
});

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Toolbar icon: per-tab state from content.js ─────────────────────
  if (msg.type === 'STATUS_UPDATE') {
    if (sender.tab) setIconState(stateFromStatus(msg), sender.tab.id);
    return false;
  }

  // ── Stats: record a new HDR video view ──────────────────────────────
  if (msg.type === 'TRACK_HDR_VIEW') {
    const { videoId, hdrType } = msg;
    loadStats().then(stats => {
      const today = todayKey();
      if (stats.todayKey !== today) { stats.todayKey = today; stats.todayVideos = 0; }
      if (!stats.seenVideoIds.includes(videoId)) {
        stats.seenVideoIds.push(videoId);
        if (stats.seenVideoIds.length > 1000) stats.seenVideoIds.shift();
        stats.totalVideos++;
        stats.todayVideos++;
        if (hdrType === 'HLG') stats.hlgCount++;
        else if (hdrType === 'PQ') stats.pqCount++;
        saveStats(stats);
      }
    });
    return false;
  }

  // ── Stats: accumulate dimming duration ──────────────────────────────
  if (msg.type === 'TRACK_DIMMING_END') {
    const secs = msg.seconds || 0;
    if (secs > 4) {
      loadStats().then(stats => {
        stats.totalSeconds += secs;
        saveStats(stats);
      });
    }
    return false;
  }

  // ── Stats: read for popup ────────────────────────────────────────────
  if (msg.type === 'GET_STATS') {
    loadStats().then(stats => {
      // Refresh today counter if date rolled over
      if (stats.todayKey !== todayKey()) { stats.todayVideos = 0; }
      sendResponse(stats);
    });
    return true;
  }
});
