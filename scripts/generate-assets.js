// Genera assets/icon.png, assets/splash.png, assets/icon-foreground.png y
// assets/icon-background.png para @capacitor/assets (sin dependencias externas).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- PNG writer ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePNG(file, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  console.log('OK', file, `${w}x${h}`);
}

// ---------- helpers ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function over(dst, src, a) { return [mix(dst[0], src[0], a), mix(dst[1], src[1], a), mix(dst[2], src[2], a)]; }
// rect redondeado con radios distintos arriba/abajo (SDF)
function sdRoundRect(px, py, cx, cy, hw, hh, rTop, rBot) {
  const dx = Math.abs(px - cx), dy = py - cy;
  const r = dy < 0 ? rTop : rBot;
  const qx = dx - hw + r, qy = Math.abs(dy) - hh + r;
  const d = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  return d;
}
const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
const cov = d => clamp(0.5 - d, 0, 1);

// ---------- escena: jarra de cerveza ----------
// Coordenadas de diseño en un espacio de 1024x1024.
const MUG = { cx: 480, cy: 590, hw: 175, hh: 195, r: 45 };
const HANDLE = { cx: 715, cy: 590, rMid: 88, half: 30 };
const FOAM = {
  bar: { cx: 480, cy: 408, hw: 190, hh: 58, r: 58 },
  blobs: [
    { cx: 385, cy: 385, r: 58 },
    { cx: 495, cy: 358, r: 68 },
    { cx: 595, cy: 390, r: 50 }
  ]
};
const SHINE = { cx: 385, cy: 600, hw: 26, hh: 150, r: 26 };
const BUBBLES = [
  { cx: 455, cy: 655, r: 16, a: 0.35 },
  { cx: 540, cy: 715, r: 12, a: 0.3 },
  { cx: 490, cy: 755, r: 9, a: 0.28 }
];
const C = {
  bgTop: hex('#FFF6E8'), bgBot: hex('#FFE2B8'),
  beerTop: hex('#FBBF24'), beerBot: hex('#D97706'),
  handle: hex('#B45309'),
  foam: hex('#FFF9F0'),
  white: hex('#FFFFFF')
};

function scene(px, py, opts) {
  // transforma pixel de canvas -> espacio de diseño
  const s = opts.scale, ox = 512, oy = opts.cy;
  const x = (px - ox) / s + 512, y = (py - oy) / s + 590;
  let col;
  if (opts.bg === 'gradient') {
    const t = clamp((px / opts.size) * 0.45 + (py / opts.size) * 0.55, 0, 1);
    col = [mix(C.bgTop[0], C.bgBot[0], t), mix(C.bgTop[1], C.bgBot[1], t), mix(C.bgTop[2], C.bgBot[2], t)];
  } else if (opts.bg === 'solid') {
    col = opts.bgColor.slice();
  } else {
    col = [0, 0, 0]; // transparente
  }
  const A = opts.alpha ?? 1;
  // asa (detrás del cuerpo)
  const dh = Math.abs(Math.hypot(x - HANDLE.cx, y - HANDLE.cy) - HANDLE.rMid) - HANDLE.half;
  if (dh < 0.5) col = over(col, C.handle, cov(dh) * A);
  // cuerpo de la jarra
  const dm = sdRoundRect(x, y, MUG.cx, MUG.cy, MUG.hw, MUG.hh, MUG.r, MUG.r);
  if (dm < 0.5) {
    const t = clamp((y - (MUG.cy - MUG.hh)) / (MUG.hh * 2), 0, 1);
    const beer = [mix(C.beerTop[0], C.beerBot[0], t), mix(C.beerTop[1], C.beerBot[1], t), mix(C.beerTop[2], C.beerBot[2], t)];
    col = over(col, beer, cov(dm) * A);
    // brillo del vaso
    const ds = sdRoundRect(x, y, SHINE.cx, SHINE.cy, SHINE.hw, SHINE.hh, SHINE.r, SHINE.r);
    if (ds < 0.5) col = over(col, C.white, cov(ds) * 0.3 * A);
    // burbujas
    for (const b of BUBBLES) {
      const db = sdCircle(x, y, b.cx, b.cy, b.r);
      if (db < 0.5) col = over(col, C.white, cov(db) * b.a * A);
    }
  }
  // espuma (encima de todo)
  const dfb = sdRoundRect(x, y, FOAM.bar.cx, FOAM.bar.cy, FOAM.bar.hw, FOAM.bar.hh, FOAM.bar.r, FOAM.bar.r);
  let dfoam = dfb;
  for (const f of FOAM.blobs) dfoam = Math.min(dfoam, sdCircle(x, y, f.cx, f.cy, f.r));
  if (dfoam < 0.5) col = over(col, C.foam, cov(dfoam) * A);
  return col;
}

function render(file, size, opts) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 2; // supersampling 2x2
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = scene(px + (sx + 0.5) / SS - 0.5, py + (sy + 0.5) / SS - 0.5, opts);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      rgba[i] = Math.round(r / n); rgba[i + 1] = Math.round(g / n); rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = opts.bg === 'none' ? 255 : 255;
    }
  }
  writePNG(file, size, size, rgba);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

// icono principal 1024x1024
render(path.join(outDir, 'icon.png'), 1024, { size: 1024, scale: 1, cy: 590, bg: 'gradient' });
// foreground del icono adaptativo (zona segura ~66%)
render(path.join(outDir, 'icon-foreground.png'), 1024, { size: 1024, scale: 0.66, cy: 590, bg: 'none' });
// background del icono adaptativo
render(path.join(outDir, 'icon-background.png'), 1024, { size: 1024, scale: 1, cy: 590, bg: 'solid', bgColor: hex('#FDEBC8') });
// splash 2732x2732
render(path.join(outDir, 'splash.png'), 2732, { size: 2732, scale: 1.55, cy: 1360, bg: 'solid', bgColor: hex('#FFF8EE') });
// splash oscuro
render(path.join(outDir, 'splash-dark.png'), 2732, { size: 2732, scale: 1.55, cy: 1360, bg: 'solid', bgColor: hex('#241A10') });
// favicon para la web app
render(path.join(__dirname, '..', 'src', 'assets', 'icon', 'favicon.png'), 64, { size: 64, scale: 0.0625, cy: 590, bg: 'gradient' });
console.log('Listo.');
