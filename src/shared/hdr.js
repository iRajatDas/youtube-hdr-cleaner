// ── HDR brightness constants ──────────────────────────────────────────────
// Both HLG and PQ define reference white = 203 cd/m² (ITU-R BT.2100).
// SDR reference white = 100 cd/m².
// CSS brightness correction in gamma-encoded space (γ = 2.2):
//   brightness = (100/203)^(1/2.2) ≈ 0.724 → 72%
// PQ gets −4 (68%) because PQ content is typically mastered to higher peaks,
// making tone-mapped highlights appear brighter. MaxCLL is not exposed by
// YouTube's API, so this heuristic is the best available.

export const HDR_BRIGHTNESS = {
  HLG: Math.round(Math.pow(100 / 203, 1 / 2.2) * 100), // 72
  PQ:  Math.round(Math.pow(100 / 203, 1 / 2.2) * 100) - 4, // 68
};

export function classifyTransfer(tc) {
  if (!tc) return null;
  if (tc.includes('ARIB_STD_B67'))                            return 'HLG';
  if (tc.includes('SMPTEST2084') || tc.includes('SMPTE2084')) return 'PQ';
  return null;
}

// Events used between the MAIN-world detector (page.js) and content.js
export const EVT_STATE   = 'hdr-cleaner:state';
export const EVT_REQUEST = 'hdr-cleaner:request';
export const EVT_BLOCK   = 'hdr-cleaner:block';  // detail '1' | '0' — blocking switched on/off
export const EVT_RELOAD  = 'hdr-cleaner:reload'; // reload the current HDR video so it gets blocked

// localStorage flag ('0' = off) letting the MAIN-world blocker see settings.enabled
export const BLOCK_KEY = 'hdr-cleaner:block';

// Channels whose HDR is kept: a localStorage mirror (JSON array of channel
// IDs) the blocker reads at page start, and an event when the list changes
export const ALLOW_KEY = 'hdr-cleaner:allow';
export const EVT_ALLOW = 'hdr-cleaner:allow';
