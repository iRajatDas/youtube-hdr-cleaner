# YouTube HDR Dimmer

A Chrome extension that stops HDR videos on YouTube from blasting your eyes.
On an HDR display, YouTube HDR videos play far brighter than everything
around them. HDR Dimmer makes them match standard videos, in two layers:

1. **Block** — strips HDR formats from YouTube's player data so the player
   picks the standard (SDR) version of the video. Nothing to dim.
2. **Dim** — if an HDR stream still plays (e.g. an HDR-only upload), a dark
   overlay lowers it to standard-video brightness.

## Features

- Blocks HDR10 / Dolby Vision (PQ) and Broadcast HDR (HLG) streams
- Works on direct loads and in-app navigation (search, home, recommendations)
- Auto brightness derived from ITU-R BT.2100 reference white, or set it manually
- Toggle on/off mid-video — the video reloads at the same position with or without HDR
- Optional "Dim every video" mode
- Toolbar icon shows the state of each tab: on, HDR blocked, dimming, off
- Local-only stats: HDR videos handled, time dimmed, HDR type split

## Install (development)

```sh
npm install
npm run build:dev      # or: npm run dev  (rebuilds on change)
```

Then open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked** and pick the `dist/` folder. After rebuilding, press the
reload button on the extension card and reload your YouTube tabs.

## Scripts

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Development build into `dist/`, rebuilt on every change   |
| `npm run build:dev` | One-off development build with source maps                |
| `npm run build`     | Minified production build into `dist/`                    |
| `npm run package`   | Production build zipped for the Chrome Web Store          |
| `npm run icons`     | Re-render `public/icons/*.png` from `assets/icon.svg`     |
| `npm run clean`     | Remove `dist/` and packaged zips                          |

The version lives in `package.json` only; the build writes it into
`dist/manifest.json`.

## Project structure

```
src/
  background/   service worker — stats storage, per-tab toolbar icon
  content/      isolated-world content script — settings, dim overlay, popup messaging
  page/         MAIN-world script — HDR blocker hooks and player state detection
  popup/        toolbar popup (HTML, CSS, JS)
  shared/       constants shared across contexts (HDR brightness, event names)
public/         copied into dist/ as-is — manifest and icons
assets/         design sources (master icon SVG)
scripts/        build and icon tooling
```

### How the pieces talk

```
page (MAIN world)  ──CustomEvent──▶  content (isolated)  ──runtime message──▶  popup / background
  blocker hooks                        dim overlay, settings                     UI, stats, icon
  player detection  ◀──CustomEvent──   on/off, reload requests
```

- **`page/blocker.js`** runs at `document_start` and wraps `JSON.parse`,
  `Response.prototype.json` and `ytInitialPlayerResponse` to remove formats
  whose `colorInfo.transferCharacteristics` is PQ or HLG. It keeps a record
  of which videos it blocked so the popup can say so.
- **`page/index.js`** reads YouTube's player API to find the stream actually
  being decoded and reports HDR / blocked / standard to the content script.
- **`content/index.js`** owns settings (`chrome.storage`), applies the
  overlay, mirrors the on/off state to the MAIN world, and pushes status to
  the popup and background.
- **`background/`** keeps stats and draws the toolbar icon for each tab.

## Privacy

No data leaves your browser. Settings and stats are stored with
`chrome.storage.local`; the extension only runs on `www.youtube.com`.
