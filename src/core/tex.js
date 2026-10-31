// Procedural textures (Canvas2D). Everything is generated at load time from seeds.
import * as THREE from 'three';
import { rng, noise2, clamp } from './math.js';

export function cnv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d', { willReadFrequently: true }) }; }

export function toTex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Low-res smooth noise canvas (grey), upscaled by the caller with smoothing -> soft mottling.
export function noiseCanvas(n, scale, seed = 1, oct = 4) {
  const { c, x } = cnv(n); const id = x.createImageData(n, n); const d = id.data;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = 0, a = 0.5, f = scale / n;
    for (let o = 0; o < oct; o++) { v += a * noise2(i * f + seed * 13.1 + o * 7.7, j * f - seed * 5.3 - o * 3.1); a *= 0.5; f *= 2; }
    const g = clamp(v * 0.5 + 0.5) * 255; const k = (j * n + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = g; d[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); return c;
}

export function hex(c) { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
export function rgba(c, a = 1) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
export function shade(c, k) { const [r, g, b] = hex(c); const f = (v) => Math.round(clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255)); return `rgb(${f(r)},${f(g)},${f(b)})`; }

// Overlay soft mottling + grain onto a canvas
export function mottle(x, w, h, { amt = 0.08, scale = 6, seed = 1, grain = 0.04, op = 'soft-light' } = {}) {
  const n = noiseCanvas(128, scale, seed, 5);
  x.save(); x.globalCompositeOperation = op; x.globalAlpha = amt * 4; x.imageSmoothingEnabled = true; x.drawImage(n, 0, 0, w, h); x.restore();
  if (grain > 0) {
    const id = x.getImageData(0, 0, w, h), d = id.data, r = rng(seed * 31 + 7);
    for (let k = 0; k < d.length; k += 4) { const g = (r() - 0.5) * 255 * grain; d[k] += g; d[k + 1] += g; d[k + 2] += g; }
    x.putImageData(id, 0, 0);
  }
}

export function fibers(x, w, h, { n = 6000, color = [110, 90, 70], alpha = 0.05, len = 14, seed = 3, width = 1.2 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * w, b = r() * h, t = r() * Math.PI * 2, l = r() * len;
    x.strokeStyle = `rgba(${color[0] + (r() * 40 - 20) | 0},${color[1] + (r() * 40 - 20) | 0},${color[2]},${r() * alpha})`;
    x.lineWidth = r() * width + 0.3; x.beginPath(); x.moveTo(a, b);
    x.quadraticCurveTo(a + Math.cos(t + 0.5) * l * 0.5, b + Math.sin(t + 0.5) * l * 0.5, a + Math.cos(t) * l, b + Math.sin(t) * l); x.stroke();
  }
}

const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

export function paperCanvas(base = '#efe6d4', { w = 1024, seed = 1, fib = 7000, mot = 0.07 } = {}) {
  const { c, x } = cnv(w); x.fillStyle = base; x.fillRect(0, 0, w, w);
  mottle(x, w, w, { amt: mot, scale: 5, seed, grain: 0.035 });
  fibers(x, w, w, { n: fib, seed: seed + 1, alpha: 0.06 });
  fibers(x, w, w, { n: fib / 3, seed: seed + 2, color: [255, 250, 240], alpha: 0.08 });
  return c;
}
export const paperTex = (base = '#efe6d4', seed = 1, rep = 1) => memo(`paper${base}${seed}${rep}`, () => { const t = toTex(paperCanvas(base, { seed }), { repeat: true }); t.repeat.set(rep, rep); return t; });

export function feltCanvas(base, { w = 512, seed = 5 } = {}) {
  const { c, x } = cnv(w); x.fillStyle = base; x.fillRect(0, 0, w, w);
  mottle(x, w, w, { amt: 0.1, scale: 10, seed, grain: 0.09 });
  fibers(x, w, w, { n: 9000, seed, color: hex(shade(base, 0.35)), alpha: 0.18, len: 6, width: 0.8 });
  fibers(x, w, w, { n: 6000, seed: seed + 9, color: hex(shade(base, -0.4)), alpha: 0.18, len: 5, width: 0.8 });
  return c;
}
export const feltTex = (base, seed = 5, rep = 1) => memo(`felt${base}${seed}${rep}`, () => { const t = toTex(feltCanvas(base, { seed }), { repeat: true }); t.repeat.set(rep, rep); return t; });

export function knitCanvas(base, { w = 512, seed = 7, rows = 32 } = {}) {
  const { c, x } = cnv(w); x.fillStyle = shade(base, -0.35); x.fillRect(0, 0, w, w);
  const s = w / rows; const r = rng(seed);
  for (let j = 0; j < rows; j++) for (let i = 0; i < rows; i++) {
    const cx = i * s + s / 2, cy = j * s + s / 2; const k = (r() - 0.5) * 0.12;
    for (const side of [-1, 1]) {
      const g = x.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
      g.addColorStop(0, shade(base, 0.12 + k)); g.addColorStop(1, shade(base, -0.15 + k));
      x.fillStyle = g; x.beginPath();
      x.ellipse(cx + side * s * 0.2, cy, s * 0.22, s * 0.52, side * -0.55, 0, Math.PI * 2); x.fill();
    }
  }
  mottle(x, w, w, { amt: 0.05, scale: 6, seed, grain: 0.05 });
  return c;
}
export const knitTex = (base, seed = 7, rep = 1) => memo(`knit${base}${seed}${rep}`, () => { const t = toTex(knitCanvas(base, { seed }), { repeat: true }); t.repeat.set(rep, rep); return t; });

export function woodCanvas(base = '#7a5236', { w = 1024, h = 256, seed = 11, dark = -0.35 } = {}) {
  const { c, x } = cnv(w, h); x.fillStyle = base; x.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const y0 = r() * h, amp = 2 + r() * 8, fr = 0.002 + r() * 0.006, ph = r() * 10;
    x.strokeStyle = `rgba(30,15,5,${0.05 + r() * 0.18})`; x.lineWidth = 0.6 + r() * 2.4; x.beginPath();
    for (let X = 0; X <= w; X += 8) { const Y = y0 + Math.sin(X * fr + ph) * amp + noise2(X * 0.01, i) * 4; X === 0 ? x.moveTo(X, Y) : x.lineTo(X, Y); }
    x.stroke();
  }
  mottle(x, w, h, { amt: 0.1, scale: 8, seed, grain: 0.04 });
  return c;
}
export const woodTex = (base, seed = 11, rx = 1, ry = 1) => memo(`wood${base}${seed}${rx}${ry}`, () => { const t = toTex(woodCanvas(base, { seed }), { repeat: true }); t.repeat.set(rx, ry); return t; });

// Generic rough/metal map: G=roughness, B=metalness (three.js convention)
export function ormCanvas(w, h, fn) {
  const { c, x } = cnv(w, h); const id = x.createImageData(w, h); const d = id.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [ro, me] = fn(i / w, j / h); const k = (j * w + i) * 4; d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = me * 255; d[k + 3] = 255; }
  x.putImageData(id, 0, 0); return c;
}

// Lithographed tin: paint layer drawn by `design(x,w,h)`, then wear on edges + scratches + rust.
// Returns {map, orm} textures. Wear exposes bare steel.
export function tinLitho(design, { w = 512, h = 512, seed = 21, wear = 1, edge = true } = {}) {
  const { c, x } = cnv(w, h);
  design(x, w, h);
  // slight print misregistration ghost
  x.save(); x.globalAlpha = 0.06; x.globalCompositeOperation = 'multiply'; x.drawImage(c, 2, -1); x.restore();
  mottle(x, w, h, { amt: 0.05, scale: 7, seed, grain: 0.03 });
  const r = rng(seed);
  const wearMask = new Float32Array(w * h);
  const N = 96, nC = noiseCanvas(N, 9, seed + 3, 4).getContext('2d').getImageData(0, 0, N, N).data;
  const nAt = (u, v) => nC[((Math.min(N - 1, (v * N) | 0)) * N + Math.min(N - 1, (u * N) | 0)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = i / w, v = j / h; const ed = edge ? Math.min(u, 1 - u, v, 1 - v) : 1;
    const n = nAt(u, v) + (r() - 0.5) * 0.15;
    let m = clamp((0.045 * wear - ed) / 0.03 + (n - 0.55) * 2.2);
    m = Math.max(m, clamp((n - 0.86) * 9 * wear));
    wearMask[j * w + i] = m;
  }
  // scratches
  const scr = cnv(w, h); scr.x.strokeStyle = '#fff';
  for (let i = 0; i < 60 * wear; i++) { scr.x.globalAlpha = 0.25 + r() * 0.6; scr.x.lineWidth = 0.5 + r() * 1.1; const a = r() * w, b = r() * h, t = r() * Math.PI, l = 8 + r() * 50; scr.x.beginPath(); scr.x.moveTo(a, b); scr.x.lineTo(a + Math.cos(t) * l, b + Math.sin(t) * l); scr.x.stroke(); }
  const sd = scr.x.getImageData(0, 0, w, h).data;
  const id = x.getImageData(0, 0, w, h); const d = id.data;
  const orm = cnv(w, h); const od = orm.x.createImageData(w, h); const o = od.data;
  for (let k = 0, p = 0; p < w * h; p++, k += 4) {
    const m = Math.max(wearMask[p], sd[k + 3] / 255 * 0.9);
    const steel = 168 + (r() - 0.5) * 30;
    // rust specks inside heavy wear
    const rust = m > 0.85 && r() < 0.05;
    const tr = rust ? 120 : steel, tg = rust ? 62 : steel - 4, tb = rust ? 30 : steel - 10;
    d[k] = d[k] * (1 - m) + tr * m; d[k + 1] = d[k + 1] * (1 - m) + tg * m; d[k + 2] = d[k + 2] * (1 - m) + tb * m;
    o[k] = 255; o[k + 1] = (0.42 * (1 - m) + (rust ? 0.9 : 0.3) * m) * 255; o[k + 2] = (0.18 * (1 - m) + (rust ? 0.1 : 0.95) * m) * 255; o[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); orm.x.putImageData(od, 0, 0);
  return { map: toTex(c), orm: toTex(orm.c, { srgb: false }) };
}

export function rivets(x, pts, r = 5, base = '#c9a24a') {
  for (const [a, b] of pts) {
    const g = x.createRadialGradient(a - r * 0.35, b - r * 0.35, r * 0.1, a, b, r);
    g.addColorStop(0, shade(base, 0.6)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.5));
    x.fillStyle = g; x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill();
  }
}

export function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

// Halftone two-colour print: draw a greyscale tone image via `toneFn(ctx)` into an offscreen
// canvas (white=no ink), then convert to rotated dot screen in `ink` over paper.
export function halftone(dst, w, h, toneFn, ink, { cell = 6, angle = 0.785, seed = 1, offset = [0, 0] } = {}) {
  const t = cnv(w, h); t.x.fillStyle = '#fff'; t.x.fillRect(0, 0, w, h); toneFn(t.x, w, h);
  const td = t.x.getImageData(0, 0, w, h).data;
  const ca = Math.cos(angle), sa = Math.sin(angle); const r = rng(seed);
  dst.save(); dst.fillStyle = ink;
  const diag = Math.hypot(w, h);
  for (let v = -diag; v < diag; v += cell) for (let u = -diag; u < diag; u += cell) {
    const px = u * ca - v * sa + w / 2, py = u * sa + v * ca + h / 2;
    if (px < -cell || py < -cell || px > w + cell || py > h + cell) continue;
    const ix = clamp(px | 0, 0, w - 1), iy = clamp(py | 0, 0, h - 1);
    const tone = 1 - td[(iy * w + ix) * 4] / 255; if (tone < 0.03) continue;
    const rad = Math.sqrt(tone) * cell * 0.62 * (0.92 + r() * 0.16);
    dst.globalAlpha = 0.92; dst.beginPath(); dst.arc(px + offset[0], py + offset[1], rad, 0, Math.PI * 2); dst.fill();
  }
  dst.restore();
}
