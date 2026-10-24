// ── Toolbar icon ──────────────────────────────────────────────────────────
// Drawn at runtime so it can show what the extension is doing in each tab.
// Glyphs are Lucide-style strokes on a 24-unit grid, matching the popup.

const TILE  = '#1c1c20';
const AMBER = '#fbbf24';
const MUTED = '#6e6e78';

const SUN_RAYS = 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41' +
                 'M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41';
const MOON     = 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z';

// state → glyph, glyph colour, optional status dot, tooltip
export const ICON_STATES = {
  on:      { glyph: 'sun',  color: AMBER,     title: 'YouTube HDR Cleaner — on' },
  blocked: { glyph: 'sun',  color: AMBER,     dot: '#34d399', title: 'YouTube HDR Cleaner — HDR blocked, playing standard version' },
  allowed: { glyph: 'sun',  color: AMBER,     dot: AMBER,     title: 'YouTube HDR Cleaner — HDR kept for this channel' },
  dimming: { glyph: 'moon', color: '#8b8cff', dot: '#8b8cff', title: 'YouTube HDR Cleaner — dimming this video' },
  off:     { glyph: 'sun',  color: MUTED,     slash: true,    title: 'YouTube HDR Cleaner — off' },
};

function draw(size, { glyph, color, dot, slash }) {
  const ctx = new OffscreenCanvas(size, size).getContext('2d');
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = ctx.lineJoin = 'round';

  ctx.fillStyle = TILE;
  ctx.beginPath(); ctx.roundRect(0, 0, 24, 24, 6); ctx.fill();

  // glyph, inset within the tile
  ctx.save();
  ctx.translate(12, 12); ctx.scale(.7, .7); ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  if (glyph === 'moon') {
    ctx.stroke(new Path2D(MOON));
  } else {
    ctx.beginPath(); ctx.arc(12, 12, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.stroke(new Path2D(SUN_RAYS));
  }
  ctx.restore();

  if (slash) {
    for (const [style, width] of [[TILE, 5], [color, 2]]) {
      ctx.strokeStyle = style; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(5, 19); ctx.lineTo(19, 5); ctx.stroke();
    }
  }

  // status dot, cut out of the tile with a ring
  if (dot) {
    ctx.fillStyle = TILE;
    ctx.beginPath(); ctx.arc(19, 19, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dot;
    ctx.beginPath(); ctx.arc(19, 19, 3.8, 0, Math.PI * 2); ctx.fill();
  }
  return ctx.getImageData(0, 0, size, size);
}

const cache = {};
function imageData(state) {
  return cache[state] ||= { 16: draw(16, ICON_STATES[state]), 32: draw(32, ICON_STATES[state]) };
}

// tabId omitted → the default for every tab without its own state
export function setIconState(state, tabId) {
  const target = tabId == null ? {} : { tabId };
  // Callback form: works in Chrome and Firefox; reading lastError silences a
  // closed tab's "No tab with id" error
  const ignore = () => void chrome.runtime.lastError;
  chrome.action.setIcon({ ...target, imageData: imageData(state) }, ignore);
  chrome.action.setTitle({ ...target, title: ICON_STATES[state].title }, ignore);
}

// Maps a content-script status to an icon state
export function stateFromStatus({ isHDR, blockedType, channelAllowed, settings }) {
  if (!settings || !settings.enabled)  return 'off';
  if (channelAllowed)                  return isHDR ? 'allowed' : 'on';
  if (isHDR || settings.forceApply)    return 'dimming';
  if (blockedType)                     return 'blocked';
  return 'on';
}
