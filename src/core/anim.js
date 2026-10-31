// Keyframe tracks, stepped ("on twos") time, and deterministic secondary-motion springs.
import { ease, clamp, lerp } from './math.js';

export const FPS = 24;

// keys: [[time, value, easeIntoThisKey?], ...]; value may be number or array.
export function track(keys, defEase = 'inOutCubic') {
  keys = keys.slice().sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    let i = 1; while (keys[i][0] < t) i++;
    const k0 = keys[i - 1], k1 = keys[i];
    const e = k1[2] || defEase;
    const fn = typeof e === 'function' ? e : ease[e];
    const u = fn(clamp((t - k0[0]) / (k1[0] - k0[0])));
    const a = k0[1], b = k1[1];
    if (Array.isArray(a)) return a.map((v, j) => lerp(v, b[j], u));
    return lerp(a, b, u);
  };
}

// Pose tracks: keys of objects {joint: value}; missing joints hold previous value.
export function poseTrack(keys, defEase = 'inOutCubic') {
  const names = new Set(); keys.forEach((k) => Object.keys(k[1]).forEach((n) => names.add(n)));
  const filled = []; let prev = {};
  for (const k of keys) { prev = { ...prev, ...k[1] }; filled.push([k[0], prev, k[2]]); }
  const tracks = {};
  for (const n of names) {
    const ks = filled.filter((k) => k[1][n] !== undefined).map((k) => [k[0], k[1][n], k[2]]);
    tracks[n] = track(ks, defEase);
  }
  return (t) => { const o = {}; for (const n in tracks) o[n] = tracks[n](t); return o; };
}

// Stop-motion time: characters are posed on twos (12 poses/s) while the camera runs at 24.
export const onTwos = (t) => Math.floor(t * FPS / 2) * 2 / FPS;

// Damped spring follower integrated from t0 with fixed substeps (deterministic per frame).
export function springSim(targetFn, t0, t, { k = 120, d = 12, dt = 1 / 240, x0 } = {}) {
  let x = x0 !== undefined ? x0 : targetFn(t0), v = 0;
  if (t <= t0) return x;
  const n = Math.ceil((t - t0) / dt);
  const h = (t - t0) / n;
  for (let i = 1; i <= n; i++) {
    const tt = t0 + i * h, tgt = targetFn(tt);
    const a = k * (tgt - x) - d * v;
    v += a * h; x += v * h;
  }
  return x;
}

// Vector spring (arrays)
export function springSimV(targetFn, t0, t, opts = {}) {
  const dim = targetFn(t0).length; const out = [];
  for (let j = 0; j < dim; j++) out.push(springSim((tt) => targetFn(tt)[j], t0, t, opts));
  return out;
}

// Time-windowed helper: 0..1 progress inside [a,b]
export const win = (t, a, b, e = 'linear') => ease[e](clamp((t - a) / (b - a)));
