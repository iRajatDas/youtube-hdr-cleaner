// Generates minimal PNG icons without any external dependencies
// Uses raw PNG binary encoding

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size) {
  const width = size;
  const height = size;

  // RGBA pixel grid
  const pixels = new Uint8Array(width * height * 4);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    // Alpha blend over existing
    const alpha = a / 255;
    const invAlpha = 1 - alpha;
    pixels[i]     = Math.round(r * alpha + pixels[i]     * invAlpha);
    pixels[i + 1] = Math.round(g * alpha + pixels[i + 1] * invAlpha);
    pixels[i + 2] = Math.round(b * alpha + pixels[i + 2] * invAlpha);
    pixels[i + 3] = Math.min(255, pixels[i + 3] + a);
  }

  function fillRect(x0, y0, w, h, r, g, b, a) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        setPixel(x, y, r, g, b, a);
  }

  // Draw anti-aliased circle outline
  function drawCircle(cx, cy, radius, lineWidth, r, g, b) {
    const half = lineWidth / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const diff = Math.abs(dist - radius);
        if (diff <= half + 1) {
          const alpha = Math.max(0, Math.min(255, (half + 1 - diff) * 255));
          setPixel(x, y, r, g, b, alpha);
        }
      }
    }
  }

  // Draw anti-aliased line
  function drawLine(x0, y0, x1, y1, lineWidth, r, g, b) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len * 2);
    const half = lineWidth / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      // Splat a circle at each point
      const r2 = Math.ceil(half + 1);
      for (let oy = -r2; oy <= r2; oy++) {
        for (let ox = -r2; ox <= r2; ox++) {
          const dist = Math.sqrt(ox * ox + oy * oy);
          if (dist <= half + 1) {
            const alpha = Math.max(0, Math.min(255, (half + 1 - dist) * 255));
            setPixel(Math.round(px + ox), Math.round(py + oy), r, g, b, alpha);
          }
        }
      }
    }
  }

  // Rounded rect background (#1a1a1a)
  const bg = { r: 26, g: 26, b: 26 };
  const radius = Math.round(size * 0.28);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Distance from corner regions
      const cx = x < radius ? radius : x >= width - radius ? width - radius - 1 : x;
      const cy = y < radius ? radius : y >= height - radius ? height - radius - 1 : y;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const a = d <= radius ? 255 : d <= radius + 1 ? Math.round((radius + 1 - d) * 255) : 0;
      if (a > 0) setPixel(x, y, bg.r, bg.g, bg.b, a);
    }
  }

  const s = size;
  const hw = s / 2;
  const hh = s / 2;
  const sunR = s * 0.18;
  const lw = s * 0.055;
  const rayGap = sunR + s * 0.04;
  const rayEnd = rayGap + s * 0.08;
  const red = { r: 255, g: 68, b: 68 };

  // Sun circle
  drawCircle(hw, hh, sunR, lw, red.r, red.g, red.b);

  // 8 rays
  for (let deg = 0; deg < 360; deg += 45) {
    const rad = (deg * Math.PI) / 180;
    drawLine(
      hw + Math.cos(rad) * rayGap,
      hh + Math.sin(rad) * rayGap,
      hw + Math.cos(rad) * rayEnd,
      hh + Math.sin(rad) * rayEnd,
      lw, red.r, red.g, red.b
    );
  }

  // Diagonal slash (top-right to bottom-left)
  const margin = s * 0.18;
  drawLine(margin, s - margin, s - margin, margin, lw * 1.25, red.r, red.g, red.b);

  // Encode as PNG
  return encodePNG(pixels, width, height);
}

function encodePNG(pixels, width, height) {
  // Build raw scanlines (filter byte 0 = None per row)
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      const si = rowOffset + 1 + x * 4;
      scanlines[si]     = pixels[pi];
      scanlines[si + 1] = pixels[pi + 1];
      scanlines[si + 2] = pixels[pi + 2];
      scanlines[si + 3] = pixels[pi + 3];
    }
  }

  const compressed = zlib.deflateSync(scanlines);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBytes = Buffer.from(type, 'ascii');
    const combined = Buffer.concat([typeBytes, data]);
    const crc = crc32(combined);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach((size) => {
  const png = createPNG(size);
  const out = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`Generated: ${out} (${png.length} bytes)`);
});

console.log('Done.');
