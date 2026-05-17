#!/usr/bin/env node
// Usage:
//   node build.js           → compact dev build to root/ (minified, inline source maps)
//   node build.js --prod    → fully minified prod build to dist/  (no source maps)
//   node build.js --watch   → dev build with file watching
const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

const isProd  = process.argv.includes('--prod');
const isWatch = process.argv.includes('--watch');
const outDir  = isProd ? 'dist' : '.';

if (isProd && !fs.existsSync('dist')) fs.mkdirSync('dist');

// Dev:  whitespace + syntax minified (compact but not obfuscated), inline source maps
// Prod: full minification incl. identifier mangling, no source maps
const jsConfig = {
  entryPoints: {
    background: 'src/background.js',
    content:    'src/content.js',
    page:       'src/page.js',
    popup:      'src/popup.js',
  },
  bundle:            true,
  outdir:            outDir,
  minify:    isProd,    // prod: full minification (whitespace + syntax + identifiers)
  sourcemap: !isProd,  // dev: source maps alongside readable output
  target:            ['chrome112'],
  format:            'iife',
  logLevel:          'info',
};

const cssConfig = {
  entryPoints: { popup: 'src/popup.css' },
  bundle:           true,
  outdir:           outDir,
  minify:           true,            // CSS always minified in both modes
  logLevel:         'info',
};

function copyStatic() {
  if (!isProd) return;
  const cp = (src, dst) => fs.copyFileSync(src, path.join('dist', dst));
  cp('popup.html',   'popup.html');
  cp('manifest.json','manifest.json');
  if (!fs.existsSync('dist/icons')) fs.mkdirSync('dist/icons');
  ['icon16.png','icon48.png','icon128.png'].forEach(f => cp(`icons/${f}`, `icons/${f}`));
  console.log('Static assets → dist/');
}

async function main() {
  const [js, css] = await Promise.all([
    esbuild.context(jsConfig),
    esbuild.context(cssConfig),
  ]);

  if (isWatch) {
    await Promise.all([js.watch(), css.watch()]);
    console.log('Watching src/ …');
  } else {
    await Promise.all([js.rebuild(), css.rebuild()]);
    await Promise.all([js.dispose(), css.dispose()]);
    copyStatic();

    const mode = isProd ? 'production → dist/' : 'development → root/';
    console.log(`\nBuild complete [${mode}]`);
    if (!isProd) console.log('Load the extension from this directory in Chrome.');
    else         console.log('Load the extension from dist/ for production testing.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
