#!/usr/bin/env node
// Builds the extension into dist/ — load that folder in chrome://extensions.
//
//   node scripts/build.js            development build (source maps)
//   node scripts/build.js --watch    development build, rebuilt on change
//   node scripts/build.js --prod     minified production build
const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

const ROOT    = path.join(__dirname, '..');
const DIST    = path.join(ROOT, 'dist');
const isProd  = process.argv.includes('--prod');
const isWatch = process.argv.includes('--watch');

// Output names are what public/manifest.json and popup.html refer to
const config = {
  absWorkingDir: ROOT,
  entryPoints: {
    background: 'src/background/index.js',
    content:    'src/content/index.js',
    page:       'src/page/index.js',
    popup:      'src/popup/index.js',   // also emits popup.css
  },
  bundle:    true,
  outdir:    DIST,
  format:    'iife',
  target:    ['chrome112'],
  minify:    isProd,
  sourcemap: !isProd,
  logLevel:  'info',
};

// public/ is copied as-is; the manifest version comes from package.json so
// there is a single place to bump it
function copyStatic() {
  fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/popup/popup.html'), path.join(DIST, 'popup.html'));

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8'));
  manifest.version = require(path.join(ROOT, 'package.json')).version;
  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

const staticPlugin = {
  name: 'static',
  setup(build) { build.onEnd(result => { if (!result.errors.length) copyStatic(); }); },
};

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  const ctx = await esbuild.context({ ...config, plugins: [staticPlugin] });

  if (isWatch) {
    await ctx.watch();
    // esbuild only watches the bundle graph; rebuild on static file edits too
    for (const dir of ['public', 'src/popup']) {
      fs.watch(path.join(ROOT, dir), { recursive: true }, () => ctx.rebuild().catch(() => {}));
    }
    console.log('Watching for changes — load dist/ in chrome://extensions');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log(`\nBuilt ${isProd ? 'production' : 'development'} extension → dist/`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
