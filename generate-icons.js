const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Pure-JS PNG encoder (RGBA, 8-bit) — no external dependencies.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

// Icon: lightning bolt inside a filled circle.

const BOLT = [
  [0.58, 0.16],
  [0.28, 0.54],
  [0.46, 0.54],
  [0.42, 0.84],
  [0.72, 0.44],
  [0.54, 0.44]
];

const CIRCLE_BG = [23, 26, 38]; // dark slate
const BOLT_COLOR = [255, 200, 81]; // amber

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4; // 4x4 supersampling for smooth edges
  const c = size / 2;
  const r = size * 0.47;
  const total = ss * ss;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let circle = 0;
      let bolt = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = px + (sx + 0.5) / ss;
          const y = py + (sy + 0.5) / ss;
          if (!inCircle(x, y, c, c, r)) continue;
          circle++;
          const ux = (x - c) / size + 0.5;
          const uy = (y - c) / size + 0.5;
          if (inPolygon(ux, uy, BOLT)) bolt++;
        }
      }
      const o = (py * size + px) * 4;
      if (circle === 0) continue; // transparent
      const t = bolt / circle;
      rgba[o] = Math.round(CIRCLE_BG[0] + (BOLT_COLOR[0] - CIRCLE_BG[0]) * t);
      rgba[o + 1] = Math.round(CIRCLE_BG[1] + (BOLT_COLOR[1] - CIRCLE_BG[1]) * t);
      rgba[o + 2] = Math.round(CIRCLE_BG[2] + (BOLT_COLOR[2] - CIRCLE_BG[2]) * t);
      rgba[o + 3] = Math.round((255 * circle) / total);
    }
  }
  return rgba;
}

const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = encodePNG(size, size, renderIcon(size));
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
