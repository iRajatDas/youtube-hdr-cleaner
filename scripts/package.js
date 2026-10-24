#!/usr/bin/env node
// Zips the production builds for the stores and GitHub releases:
//   youtube-hdr-cleaner-<version>-chrome.zip   (Chrome, Edge, Brave)
//   youtube-hdr-cleaner-<version>-firefox.zip
// Run `npm run build` first (npm run package does both).
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { version } = require(path.join(ROOT, 'package.json'));

for (const [browser, dir] of [['chrome', 'dist'], ['firefox', 'dist-firefox']]) {
  const src = path.join(ROOT, dir);
  if (!fs.existsSync(path.join(src, 'manifest.json'))) {
    console.error(`${dir}/ is missing — run npm run build first`);
    process.exit(1);
  }
  const zip = path.join(ROOT, `youtube-hdr-cleaner-${version}-${browser}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.', '-x', '*.map'], { cwd: src, stdio: 'inherit' });
  console.log(`Packaged ${path.basename(zip)}`);
}
