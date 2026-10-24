#!/usr/bin/env node
// Builds the extension for Chrome (dist/) and/or Firefox (dist-firefox/).
//
//   node scripts/build.js                     Chrome, development (source maps)
//   node scripts/build.js --watch             Chrome, development, rebuilt on change
//   node scripts/build.js --prod              Chrome and Firefox, minified
//   node scripts/build.js --target=firefox    Firefox only (combine with --prod/--watch)
const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

const ROOT    = path.join(__dirname, '..');
const pkg     = require(path.join(ROOT, 'package.json'));
const isProd  = process.argv.includes('--prod');
const isWatch = process.argv.includes('--watch');
const target  = (process.argv.find(a => a.startsWith('--target=')) || '').split('=')[1];

const TARGETS = {
  chrome:  { outDir: 'dist' },
  firefox: { outDir: 'dist-firefox' },
};
// Production builds both browsers unless one is named; dev builds Chrome
const targets = target ? [target] : isProd ? Object.keys(TARGETS) : ['chrome'];
for (const t of targets) if (!TARGETS[t]) { console.error(`Unknown target "${t}"`); process.exit(1); }

// public/manifest.json is the Chrome manifest; Firefox differences are applied here
function manifestFor(browser) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8'));
  // package.json is the only place the version lives
  const { manifest_version, name, short_name, ...rest } = source;
  const manifest = { manifest_version, name, short_name, version: pkg.version, ...rest };
  if (browser === 'firefox') {
    // Firefox MV3 runs background scripts as an event page, not a service worker
    manifest.background = { scripts: [manifest.background.service_worker] };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'youtube-hdr-cleaner@irajatdas.github.io',
        strict_min_version: '128.0', // content scripts in the MAIN world
        data_collection_permissions: { required: ['none'] },
      },
    };
  }
  return manifest;
}

function copyStatic(browser, outDir) {
  fs.cpSync(path.join(ROOT, 'public'), outDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/popup/popup.html'), path.join(outDir, 'popup.html'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(outDir, 'LICENSE'));
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifestFor(browser), null, 2) + '\n');
}

async function build(browser) {
  const outDir = path.join(ROOT, TARGETS[browser].outDir);
  fs.rmSync(outDir, { recursive: true, force: true });

  const ctx = await esbuild.context({
    absWorkingDir: ROOT,
    // Output names are what the manifest and popup.html refer to
    entryPoints: {
      background: 'src/background/index.js',
      content:    'src/content/index.js',
      page:       'src/page/index.js',
      popup:      'src/popup/index.js',   // also emits popup.css
    },
    bundle:    true,
    outdir:    outDir,
    format:    'iife',
    target:    ['chrome112', 'firefox128'],
    minify:    isProd,
    sourcemap: !isProd,
    logLevel:  'info',
    plugins: [{
      name: 'static',
      setup(b) { b.onEnd(result => { if (!result.errors.length) copyStatic(browser, outDir); }); },
    }],
  });

  if (isWatch) {
    await ctx.watch();
    // esbuild only watches the bundle graph; rebuild on static file edits too
    for (const dir of ['public', 'src/popup']) {
      fs.watch(path.join(ROOT, dir), { recursive: true }, () => ctx.rebuild().catch(() => {}));
    }
    console.log(`Watching for changes — load ${TARGETS[browser].outDir}/ in the browser`);
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log(`Built ${isProd ? 'production' : 'development'} ${browser} extension → ${TARGETS[browser].outDir}/`);
  }
}

Promise.all(targets.map(build)).catch(e => { console.error(e); process.exit(1); });
