// Run with: node generate-icons.js
// Requires: npm install canvas  (or use the built-in if available)
// Alternatively, open generate-icons.html in a browser and save the canvases.

const fs = require('fs');
const path = require('path');

function createIconSVG(size) {
  const s = size;
  const r = Math.round(s * 0.28); // corner radius
  const cx = s / 2;
  const cy = s / 2;
  const sunR = s * 0.18;
  const rayLen = s * 0.08;
  const rayGap = sunR + s * 0.04;

  // Build 8 ray endpoints
  function ray(angle) {
    const rad = (angle * Math.PI) / 180;
    const x1 = cx + Math.cos(rad) * rayGap;
    const y1 = cy + Math.sin(rad) * rayGap;
    const x2 = cx + Math.cos(rad) * (rayGap + rayLen);
    const y2 = cy + Math.sin(rad) * (rayGap + rayLen);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ff4444" stroke-width="${(s * 0.055).toFixed(1)}" stroke-linecap="round"/>`;
  }

  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(ray).join('\n  ');
  const sw = (s * 0.055).toFixed(1);
  const slashW = (s * 0.07).toFixed(1);
  const margin = s * 0.18;

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${s}" height="${s}" rx="${r}" fill="#1a1a1a"/>
  <circle cx="${cx}" cy="${cy}" r="${sunR}" fill="none" stroke="#ff4444" stroke-width="${sw}"/>
  ${rays}
  <line x1="${margin}" y1="${s - margin}" x2="${s - margin}" y2="${margin}" stroke="#ff4444" stroke-width="${slashW}" stroke-linecap="round"/>
</svg>`;
}

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

sizes.forEach((size) => {
  const svg = createIconSVG(size);
  const svgPath = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Written: ${svgPath}`);
});

console.log('\nSVG icons generated. To convert to PNG:');
console.log('  brew install librsvg  # macOS');
sizes.forEach((s) => {
  console.log(`  rsvg-convert -w ${s} -h ${s} icons/icon${s}.svg -o icons/icon${s}.png`);
});
