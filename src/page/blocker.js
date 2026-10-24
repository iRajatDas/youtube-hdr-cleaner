// First line of defence: strip HDR formats from YouTube's player response
// before the player sees them, so it picks an SDR stream and no dimming is
// needed. This depends on the response shape (streamingData.*Formats with
// colorInfo.transferCharacteristics); if YouTube changes it and an HDR stream
// still plays, page.js detects it and content.js falls back to dimming.
//
// Must run synchronously at document_start in the MAIN world, before YouTube
// parses or assigns its player response.
import { classifyTransfer, BLOCK_KEY, EVT_BLOCK } from '../shared/hdr.js';

const TAG = '[HDR Blocker]';

// videoId → transfer type ('PQ' | 'HLG') of the HDR formats we removed, so
// page.js can report "HDR blocked" instead of a plain SDR video
const blockedVideos = new Map();

export function blockedHdrType(videoId) {
  return enabled && blockedVideos.get(videoId) || null;
}

function isHDR(format) {
  return !!classifyTransfer(format && format.colorInfo && format.colorInfo.transferCharacteristics);
}

// Returns the filtered list and the transfer type of the first removed format
function filterFormats(formats) {
  if (!Array.isArray(formats)) return { formats, type: null };

  const filtered = formats.filter(f => !isHDR(f));
  const removed  = formats.length - filtered.length;
  if (!removed) return { formats, type: null };

  // Never leave the player with no video streams (HDR-only upload) —
  // dimming handles that case instead.
  if (!filtered.some(f => (f.mimeType || '').startsWith('video/'))) return { formats, type: null };

  console.log(`${TAG} Removed ${removed} HDR format(s).`);
  const first = formats.find(isHDR);
  return { formats: filtered, type: classifyTransfer(first.colorInfo.transferCharacteristics) };
}

// Player responses arrive bare (/player, ytInitialPlayerResponse) or wrapped
// as { playerResponse } — the latter from /get_watch on in-app navigation,
// e.g. clicking a search result. Arrays hold multi-part responses.
function sanitizePlayerResponse(data) {
  if (!enabled || !data || typeof data !== 'object') return data;
  if (Array.isArray(data)) { data.forEach(sanitizePlayerResponse); return data; }
  if (data.playerResponse) sanitizePlayerResponse(data.playerResponse);

  const sd = data.streamingData;
  if (sd && typeof sd === 'object') {
    const adaptive = filterFormats(sd.adaptiveFormats);
    const muxed    = filterFormats(sd.formats);
    sd.adaptiveFormats = adaptive.formats;
    sd.formats         = muxed.formats;

    const type    = adaptive.type || muxed.type;
    const videoId = data.videoDetails && data.videoDetails.videoId;
    if (type && videoId) blockedVideos.set(videoId, type);
  }
  return data;
}

function hookJsonParse() {
  const originalParse = JSON.parse;
  JSON.parse = function (...args) {
    const data = originalParse.apply(this, args);
    try {
      return sanitizePlayerResponse(data);
    } catch (error) {
      console.error(`${TAG} JSON filtering failed:`, error);
      return data;
    }
  };
}

// fetch(...).then(r => r.json()) parses natively without going through
// JSON.parse, so in-app navigations (/youtubei/v1/player) need their own hook.
function hookResponseJson() {
  const originalJson = Response.prototype.json;
  Response.prototype.json = function (...args) {
    return originalJson.apply(this, args).then(data => {
      try {
        return sanitizePlayerResponse(data);
      } catch (error) {
        console.error(`${TAG} Response filtering failed:`, error);
        return data;
      }
    });
  };
}

// Hook ytInitialPlayerResponse while preserving its current value.
function hookInitialResponse() {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse');

    // Avoid replacing a non-configurable property.
    if (descriptor && !descriptor.configurable) {
      console.warn(`${TAG} Initial response property is not configurable.`);
      return;
    }

    let currentValue = descriptor
      ? ('value' in descriptor ? descriptor.value : descriptor.get?.call(window))
      : undefined;

    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() { return currentValue; },
      set(value) {
        currentValue = sanitizePlayerResponse(value);
        console.log(`${TAG} Intercepted initial player response.`);
      },
    });

    if (currentValue !== undefined) currentValue = sanitizePlayerResponse(currentValue);
  } catch (error) {
    console.warn(`${TAG} Initial response hook failed:`, error);
  }
}

// content.js mirrors settings.enabled into localStorage, since chrome.storage
// isn't reachable from the MAIN world and the hooks can't wait for it, and
// sends EVT_BLOCK when it changes. The hooks are always installed so blocking
// can be switched on mid-session; they pass data through untouched while off.
let enabled = (() => {
  try { return localStorage.getItem(BLOCK_KEY) !== '0'; } catch (_) { return true; }
})();
document.addEventListener(EVT_BLOCK, e => { enabled = e.detail === '1'; });

hookJsonParse();
hookResponseJson();
hookInitialResponse();
console.log(`${TAG} Hooks installed.`);
