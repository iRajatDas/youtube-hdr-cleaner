// ── Stats ─────────────────────────────────────────────────────────────────
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

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

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
