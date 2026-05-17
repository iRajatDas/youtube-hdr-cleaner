// Runs in the page's MAIN world (declared in manifest) so it can talk to
// YouTube's player API directly. Detection is event-driven: it re-checks on
// player/navigation events and only notifies content.js when the result
// actually changes. While the player is between videos the result is
// "unknown" and nothing is sent, so the current filter is held — this is what
// prevents the bright flash on route changes and tab refocus.
// Imported first: must install its hooks before YouTube loads the player
import { blockedHdrType } from './blocker.js';
import { classifyTransfer, EVT_STATE, EVT_REQUEST, EVT_RELOAD } from './hdr.js';

const PLAYER_EVENTS = ['onStateChange', 'onVideoDataChange', 'onPlaybackQualityChange'];
const HDR_DISPLAY   = matchMedia('(dynamic-range: high)');
const IDLE          = { videoId: null, isHDR: false, hdrType: null, blockedType: null };

const boundPlayers = new WeakSet();
let lastSent  = '';
let pending   = 0;

function isShortsPage() { return location.pathname.startsWith('/shorts/'); }
function isVideoPage()  { return isShortsPage() || location.pathname === '/watch'; }

function activePlayer() {
  const p = document.getElementById(isShortsPage() ? 'shorts-player' : 'movie_player');
  return p && typeof p.getVideoData === 'function' ? p : null;
}

function bindPlayer(p) {
  if (boundPlayers.has(p)) return;
  boundPlayers.add(p);
  for (const e of PLAYER_EVENTS) {
    try { p.addEventListener(e, scheduleCheck); } catch (_) {}
  }
}

function transferOf(f) {
  return classifyTransfer(f.colorInfo && f.colorInfo.transferCharacteristics);
}

function isHdrFormat(f) {
  return !!(f && (transferOf(f) || /hdr/i.test(f.qualityLabel || '')));
}

// The stream actually being decoded, from the itag in "Stats for nerds"
// (e.g. "vp09.02.51.10… (335) / opus (251)"). Works for both the watch and
// Shorts players, unlike video_quality_features which isn't always populated.
function playingFormat(p, fmts) {
  try {
    const m = /\((\d+)\)/.exec(p.getStatsForNerds().codecs || '');
    return m && fmts.find(f => String(f.itag) === m[1]) || null;
  } catch (_) { return null; }
}

// Returns the HDR state of the player, or null when it can't be determined yet.
function detect(p) {
  let d, pr, playerState;
  try {
    d           = p.getVideoData();
    pr          = p.getPlayerResponse && p.getPlayerResponse();
    playerState = p.getPlayerState();
  } catch (_) { return null; }

  // Off a watch/shorts page, a paused leftover player shouldn't count as active
  if (!isVideoPage() && playerState !== 1) return IDLE;

  const videoId = d && d.video_id;
  if (!videoId) return null; // player is between videos — hold current state

  // getPlayerResponse() can briefly lag behind getVideoData() after a switch
  const fmts = pr && pr.videoDetails && pr.videoDetails.videoId === videoId &&
               pr.streamingData && pr.streamingData.adaptiveFormats || null;
  const hdrFmts  = fmts ? fmts.filter(isHdrFormat) : [];
  const features = Array.isArray(d.video_quality_features) ? d.video_quality_features : null;

  // Stats only reflect the new video once it's playing or paused
  const settled = playerState === 1 || playerState === 2;
  const playing = settled && fmts ? playingFormat(p, fmts) : null;

  let isHDR;
  if (playing)                                   isHDR = isHdrFormat(playing);
  else if (features && features.includes('hdr')) isHDR = true;
  else if (features && settled)                  isHDR = false; // stream chosen, not HDR
  else if (fmts) isHDR = hdrFmts.length > 0 && HDR_DISPLAY.matches; // provisional, pre-playback
  else return null;

  let hdrType = null;
  if (isHDR) {
    const q = d.video_quality;
    const f = (playing && transferOf(playing) && playing) ||
              hdrFmts.find(f => f.quality === q && transferOf(f)) || hdrFmts.find(transferOf);
    hdrType = f ? transferOf(f) : null;
  }
  // HDR was stripped by blocker.js and an SDR stream is playing instead
  const blockedType = isHDR ? null : blockedHdrType(videoId);
  return { videoId, isHDR, hdrType, blockedType };
}

function check() {
  pending = 0;
  const p = activePlayer();
  let result;
  if (p) { bindPlayer(p); result = detect(p); }
  else if (!isVideoPage()) result = IDLE;
  if (!result) return;

  const json = JSON.stringify(result);
  if (json === lastSent) return;
  lastSent = json;
  document.dispatchEvent(new CustomEvent(EVT_STATE, { detail: json }));
}

// Coalesce bursts of player/navigation events into a single check
function scheduleCheck() {
  if (!pending) pending = setTimeout(check, 50);
}

document.addEventListener(EVT_REQUEST, () => { lastSent = ''; scheduleCheck(); });

// Blocking was switched on while HDR plays: reload the video at the same spot.
// The player refetches its response through blocker.js's hooks and picks SDR.
document.addEventListener(EVT_RELOAD, () => {
  const p = activePlayer();
  if (!p || typeof p.loadVideoById !== 'function') return;
  try {
    const videoId = p.getVideoData().video_id;
    const paused  = p.getPlayerState() === 2;
    if (!videoId) return;
    const opts   = { videoId, startSeconds: p.getCurrentTime() };
    paused ? p.cueVideoById(opts) : p.loadVideoById(opts);
  } catch (_) {}
});
['yt-navigate-finish', 'yt-player-updated', 'yt-page-data-updated'].forEach(e =>
  document.addEventListener(e, scheduleCheck)
);
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleCheck(); });
HDR_DISPLAY.addEventListener('change', scheduleCheck); // window moved between displays

// Cheap safety net for missed events: local reads only, no messaging unless changed
setInterval(() => { if (!document.hidden) check(); }, 3000);

scheduleCheck();
