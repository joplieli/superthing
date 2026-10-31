// HOB — lithographed tin robot. Units: cm, height ~14, faces +Z, feet at y=0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { joint, setRot, ik2, setWorldQuat, V } from '../core/rig.js';
import { tinLitho, rivets, roundRect, shade, cnv, toTex, noiseCanvas } from '../core/tex.js';

const DRUM0 = 0;
const RED = '#c8553d', CREAM = '#efe2c4', TEAL = '#2f7f7a', BRASS = '#c9a24a', GUN = '#5d6670';

function litho(design, w, h, seed, opts = {}) { return tinLitho(design, { w, h, seed, ...opts }); }
function tinMat(l, env, extra = {}) {
  return new THREE.MeshStandardMaterial({ map: l.map, roughnessMap: l.orm, metalnessMap: l.orm, roughness: 1, metalness: 1, envMap: env, envMapIntensity: 1, ...extra });
}
function fillBase(x, w, h, c = RED) { x.fillStyle = c; x.fillRect(0, 0, w, h); }
function band(x, w, y0, y1, c) { x.fillStyle = c; x.fillRect(0, y0, w, y1 - y0); }

function brassMat(env, rough = 0.32) {
  const n = noiseCanvas(64, 6, 77, 4); const { c, x } = cnv(256); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  x.globalAlpha = 0.6; x.drawImage(n, 0, 0, 256, 256);
  const t = toTex(c, { srgb: false });
  return new THREE.MeshStandardMaterial({ color: BRASS, metalness: 1, roughness: rough, roughnessMap: t, envMap: env, envMapIntensity: 1.1 });
}

const EYE_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const EYE_FS = /* glsl */`
varying vec2 vUv;
uniform float ap, glow, lidUp, lidUpTilt, lidLo, lidLoTilt, flicker, time;
uniform vec3 warm, lidCol, ambient;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  // filament bulb visible through the iris opening
  float hole = ap * 0.92;
  float inner = smoothstep(hole + 0.015, hole - 0.03, r);
  float fil = 0.75 + 0.25 * smoothstep(0.35, 0.0, abs(p.y + 0.05 * sin(p.x * 18.0)) * 3.0) * smoothstep(0.5, 0.0, abs(p.x));
  vec3 bulb = warm * glow * (1.0 + 2.6 * fil * smoothstep(hole, 0.0, r)) * flicker;
  // iris blades (7) with overlapping edges
  float bl = fract(a / 6.2831853 * 7.0 + r * 1.3);
  float edge = smoothstep(0.0, 0.05, bl) * smoothstep(1.0, 0.85, bl);
  vec3 blade = mix(vec3(0.05, 0.045, 0.04), vec3(0.20, 0.17, 0.12), edge) * (0.6 + 0.4 * (1.0 - r));
  blade += ambient * 0.25 + warm * glow * 0.10 * smoothstep(hole + 0.25, hole, r);
  vec3 col = mix(blade, bulb, inner);
  // rim ring
  col *= smoothstep(1.0, 0.94, r);
  // metal shutter lids (upper & lower) drawn inside the bezel
  vec2 nu = vec2(sin(lidUpTilt), cos(lidUpTilt));
  float du = dot(p, nu) - (1.0 - 2.0 * lidUp);
  vec2 nl = vec2(sin(lidLoTilt), -cos(lidLoTilt));
  float dl = dot(p, nl) - (1.0 - 2.0 * lidLo);
  float lid = max(smoothstep(-0.02, 0.02, du), smoothstep(-0.02, 0.02, dl));
  float lidEdge = max(smoothstep(0.09, 0.0, abs(du)), smoothstep(0.09, 0.0, abs(dl)));
  vec3 lc = lidCol * (0.55 + 0.45 * (p.y * 0.5 + 0.5)) + ambient * 0.3;
  lc *= 1.0 - 0.6 * lidEdge;
  col = mix(col, lc, lid);
  gl_FragColor = vec4(col, 1.0);
}`;

function digitsTex() {
  const W = 1024, H = 128; const { c, x } = cnv(W, H);
  x.fillStyle = '#f1e8d2'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1d1a17'; x.font = 'bold 96px DejaVu Sans Mono, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let d = 0; d < 10; d++) {
    x.save(); x.translate((d + 0.5) * W / 10, H / 2); x.rotate(Math.PI / 2); x.fillText(String(d), 0, 4); x.restore();
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(d * W / 10, 0, 2, H); x.fillStyle = '#1d1a17';
  }
  const t = toTex(c); return t;
}

export function createHob(env) {
  const root = new THREE.Group(); root.name = 'hob';
  const J = {};
  const meshes = [];
  const add = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; parent.add(m); meshes.push(m); return m;
  };
  const brass = brassMat(env), brassDark = brassMat(env, 0.5); brassDark.color.set('#8a6a2c');

  // --- textures ---
  const torsoFront = litho((x, w, h) => {
    fillBase(x, w, h); band(x, w, 0, h * 0.13, TEAL); band(x, w, h * 0.13, h * 0.16, CREAM);
    x.fillStyle = CREAM; roundRect(x, w * 0.12, h * 0.24, w * 0.76, h * 0.62, 26); x.fill();
    x.strokeStyle = shade(RED, -0.35); x.lineWidth = 5; roundRect(x, w * 0.12, h * 0.24, w * 0.76, h * 0.62, 26); x.stroke();
    x.fillStyle = TEAL; x.font = 'bold 34px DejaVu Serif'; x.textAlign = 'center'; x.fillText('DAWNWORKS', w / 2, h * 0.33);
    x.fillStyle = RED; x.font = 'italic bold 28px DejaVu Serif'; x.fillText('No. 1', w / 2, h * 0.78);
    // odometer frame
    x.fillStyle = '#2a2420'; roundRect(x, w * 0.24, h * 0.42, w * 0.52, h * 0.2, 10); x.fill();
    x.strokeStyle = BRASS; x.lineWidth = 8; roundRect(x, w * 0.24, h * 0.42, w * 0.52, h * 0.2, 10); x.stroke();
    // vents
    x.fillStyle = shade(RED, -0.45); for (let i = 0; i < 6; i++) { roundRect(x, w * 0.2 + i * w * 0.105, h * 0.9, w * 0.07, h * 0.06, 6); x.fill(); }
    const rv = []; for (let i = 0; i < 8; i++) { rv.push([w * 0.06 + i * w * 0.125, h * 0.2]); } rv.push([w * 0.06, h * 0.55], [w * 0.94, h * 0.55], [w * 0.06, h * 0.86], [w * 0.94, h * 0.86]);
    rivets(x, rv, 7);
  }, 512, 512, 31);
  const torsoSide = litho((x, w, h) => { fillBase(x, w, h); band(x, w, 0, h * 0.13, TEAL); band(x, w, h * 0.13, h * 0.16, CREAM); band(x, w, h * 0.62, h * 0.7, CREAM); rivets(x, [[w * 0.15, h * 0.3], [w * 0.85, h * 0.3], [w * 0.15, h * 0.85], [w * 0.85, h * 0.85]], 7); }, 384, 512, 32);
  const torsoBack = litho((x, w, h) => { fillBase(x, w, h); band(x, w, 0, h * 0.13, TEAL); x.fillStyle = shade(RED, -0.3); x.beginPath(); x.arc(w / 2, h * 0.5, w * 0.16, 0, 7); x.fill(); rivets(x, [[w / 2 - w * 0.22, h * 0.5], [w / 2 + w * 0.22, h * 0.5]], 7); }, 512, 512, 33);
  const torsoTop = litho((x, w, h) => { fillBase(x, w, h, shade(RED, -0.1)); }, 256, 256, 34);
  const headFront = litho((x, w, h) => {
    fillBase(x, w, h); x.fillStyle = CREAM; roundRect(x, w * 0.06, h * 0.12, w * 0.88, h * 0.56, 40); x.fill();
    x.strokeStyle = shade(RED, -0.35); x.lineWidth = 5; roundRect(x, w * 0.06, h * 0.12, w * 0.88, h * 0.56, 40); x.stroke();
    // mouth grille
    x.fillStyle = '#2a2320'; roundRect(x, w * 0.32, h * 0.74, w * 0.36, h * 0.16, 16); x.fill();
    x.fillStyle = BRASS; for (let i = 0; i < 7; i++) { x.fillRect(w * 0.34 + i * w * 0.0475, h * 0.76, w * 0.018, h * 0.12); }
    rivets(x, [[w * 0.18, h * 0.82], [w * 0.82, h * 0.82]], 7);
  }, 640, 436, 35);
  const headSide = litho((x, w, h) => { fillBase(x, w, h); band(x, w, h * 0.86, h, TEAL); }, 384, 384, 36);
  const headTop = litho((x, w, h) => { fillBase(x, w, h); band(x, w, 0, h * 0.08, CREAM); band(x, w, h * 0.92, h, CREAM); }, 512, 384, 37, { wear: 1.4 });
  const headBack = litho((x, w, h) => { fillBase(x, w, h); x.fillStyle = shade(RED, -0.4); for (let i = 0; i < 4; i++) { roundRect(x, w * 0.25, h * (0.25 + i * 0.13), w * 0.5, h * 0.06, 8); x.fill(); } }, 512, 384, 38);
  const limbTex = litho((x, w, h) => { fillBase(x, w, h); band(x, w, 0, h * 0.12, CREAM); band(x, w, h * 0.88, h, CREAM); band(x, w, h * 0.45, h * 0.5, TEAL); }, 256, 256, 39, { edge: false });
  const pelvisTex = litho((x, w, h) => { fillBase(x, w, h, TEAL); band(x, w, h * 0.8, h, shade(TEAL, -0.3)); rivets(x, [[w * 0.1, h * 0.4], [w * 0.9, h * 0.4]], 8); }, 512, 256, 40);
  const footTex = litho((x, w, h) => { fillBase(x, w, h, TEAL); band(x, w, h * 0.7, h, CREAM); }, 256, 256, 41);
  const handTex = litho((x, w, h) => { fillBase(x, w, h, GUN); }, 256, 256, 42, { edge: true, wear: 0.8 });

  const mFront = tinMat(torsoFront, env), mSide = tinMat(torsoSide, env), mBack = tinMat(torsoBack, env), mTop = tinMat(torsoTop, env);
  const mHeadF = tinMat(headFront, env), mHeadS = tinMat(headSide, env), mHeadT = tinMat(headTop, env), mHeadB = tinMat(headBack, env);
  const mLimb = tinMat(limbTex, env), mPelvis = tinMat(pelvisTex, env), mFoot = tinMat(footTex, env), mHand = tinMat(handTex, env);
  const mDark = new THREE.MeshStandardMaterial({ color: '#221c19', roughness: 0.6, metalness: 0.3, envMap: env });

  // --- skeleton + meshes ---
  J.root = root;
  J.hips = joint('hips', root, [0, 5.2, 0]);
  add(J.hips, new RoundedBoxGeometry(3.6, 1.2, 2.4, 3, 0.35), mPelvis);
  J.spine = joint('spine', J.hips, [0, 0.5, 0]);
  add(J.spine, new RoundedBoxGeometry(5.2, 4.8, 3.4, 4, 0.45), [mSide, mSide, mTop, mTop, mFront, mBack], [0, 2.4, 0]);
  // odometer drums
  const dTex = digitsTex();
  const drumMat = new THREE.MeshStandardMaterial({ map: dTex, roughness: 0.5, metalness: 0.0, envMap: env, envMapIntensity: 0.3 });
  J.drums = [];
  for (let i = 0; i < 5; i++) {
    const d = add(J.spine, new THREE.CylinderGeometry(0.3, 0.3, 0.42, 20, 1, false), drumMat, [1.0 - i * 0.48 - 0.04, 2.46, 1.52], [0, 0, Math.PI / 2]);
    d.castShadow = false; J.drums.push(d);
  }
  add(J.spine, new THREE.BoxGeometry(2.5, 0.75, 0.3), mDark, [0.0, 2.46, 1.42]);
  // wind-up key on the back
  J.key = joint('key', J.spine, [0, 2.4, -1.7]);
  add(J.key, new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), brass, [0, 0, -0.45], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) add(J.key, new THREE.TorusGeometry(0.55, 0.13, 8, 20), brass, [s * 0.62, 0, -0.95], [0, Math.PI / 2, 0]);
  // steam vents on shoulders
  J.vents = [];
  for (const s of [-1, 1]) { add(J.spine, new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), brassDark, [s * 1.6, 5.05, -1.1]); J.vents.push(joint('vent', J.spine, [s * 1.6, 5.45, -1.1])); }
  // neck bellows
  J.neck = joint('neck', J.spine, [0, 4.8, 0]);
  for (let i = 0; i < 4; i++) add(J.neck, new THREE.CylinderGeometry(i % 2 ? 0.95 : 1.15, i % 2 ? 1.15 : 0.95, 0.22, 18), i % 2 ? mDark : brassDark, [0, 0.11 + i * 0.2, 0]);
  J.head = joint('head', J.neck, [0, 0.8, 0]);
  add(J.head, new RoundedBoxGeometry(4.8, 3.3, 3.3, 4, 0.5), [mHeadS, mHeadS, mHeadT, mTop, mHeadF, mHeadB], [0, 1.65, 0]);
  // eyes
  const eyeUniforms = () => ({ ap: { value: 0.7 }, glow: { value: 1.0 }, lidUp: { value: 0.12 }, lidUpTilt: { value: 0 }, lidLo: { value: 0.0 }, lidLoTilt: { value: 0 }, flicker: { value: 1 }, time: { value: 0 }, warm: { value: new THREE.Color('#ffc46e') }, lidCol: { value: new THREE.Color('#b0402e') }, ambient: { value: new THREE.Color('#202838') } });
  J.eyes = [];
  J.stalk = joint('stalkL', J.head, [1.2, 1.9, 1.65]);
  const stalkRings = [];
  for (let i = 0; i < 7; i++) { const r = add(J.stalk, new THREE.TorusGeometry(0.62, 0.11, 6, 18), i % 2 ? brass : mDark, [0, 0, 0]); r.visible = false; stalkRings.push(r); }
  for (const s of [1, -1]) {
    const e = s === 1 ? joint('eyeL', J.stalk, [0, 0, 0]) : joint('eyeR', J.head, [-1.2, 1.9, 1.65]);
    add(e, new THREE.TorusGeometry(0.88, 0.16, 10, 28), brass, [0, 0, 0.05]);
    add(e, new THREE.CylinderGeometry(0.86, 0.86, 0.3, 24, 1, true), mDark, [0, 0, -0.1], [Math.PI / 2, 0, 0]);
    const u = eyeUniforms();
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.84, 40), new THREE.ShaderMaterial({ vertexShader: EYE_VS, fragmentShader: EYE_FS, uniforms: u }));
    face.position.z = 0.02; e.add(face);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.86, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, roughness: 0.06, metalness: 0.0, envMap: env, envMapIntensity: 0.35, depthWrite: false }));
    glass.rotation.x = Math.PI / 2; glass.scale.set(1, 0.42, 1); glass.position.z = 0.05; e.add(glass);
    const light = new THREE.SpotLight('#ffc46e', 0, 60, 0.42, 0.7, 1.4); light.position.set(0, 0, 0.3); light.target.position.set(0, 0, 10); e.add(light); e.add(light.target);
    J.eyes.push({ j: e, u, light });
  }
  J.stalkRings = stalkRings;
  // ear dials
  J.ears = [];
  for (const s of [1, -1]) {
    const ear = joint('ear', J.head, [s * 2.45, 1.75, 0]);
    add(ear, new THREE.CylinderGeometry(0.78, 0.78, 0.36, 24), brass, [s * 0.12, 0, 0], [0, 0, Math.PI / 2]);
    add(ear, new THREE.BoxGeometry(0.1, 0.62, 0.12), mDark, [s * 0.32, 0.3, 0]);
    J.ears.push(ear);
  }
  // arms
  const armGeo = (r0, r1, len) => { const g = new THREE.CylinderGeometry(r0, r1, len, 16); g.translate(0, -len / 2, 0); return g; };
  J.arm = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint('shoulder' + side, J.spine, [s * 3.05, 4.0, 0]);
    add(sh, new THREE.SphereGeometry(0.72, 16, 12), brass);
    add(sh, armGeo(0.5, 0.5, 2.2), mLimb);
    const el = joint('elbow' + side, sh, [0, -2.2, 0]);
    add(el, new THREE.SphereGeometry(0.56, 14, 10), brass);
    add(el, armGeo(0.55, 0.66, 2.0), mLimb);
    const wr = joint('wrist' + side, el, [0, -2.0, 0]);
    add(wr, new THREE.CylinderGeometry(0.5, 0.5, 0.25, 14), brassDark, [0, -0.1, 0]);
    add(wr, new RoundedBoxGeometry(1.5, 1.4, 0.8, 3, 0.3), mHand, [0, -0.85, 0]);
    // fingers: palm faces +Z of the wrist frame, curl = +X rotation brings tips to +Z
    const fingers = [];
    for (let f = 0; f < 3; f++) {
      const k1 = joint('f' + f, wr, [(f - 1) * 0.47, -1.5, 0]);
      add(k1, new THREE.SphereGeometry(0.25, 10, 8), mHand);
      add(k1, armGeo(0.24, 0.23, 0.55), mHand);
      const k2 = joint('f' + f + 'b', k1, [0, -0.55, 0]);
      add(k2, new THREE.SphereGeometry(0.23, 10, 8), mHand);
      add(k2, armGeo(0.23, 0.2, 0.42), mHand);
      add(k2, new THREE.SphereGeometry(0.2, 10, 8), mHand, [0, -0.42, 0]);
      fingers.push([k1, k2]);
    }
    const th1 = joint('thumb', wr, [s * 0.72, -0.75, 0.25]);
    add(th1, new THREE.SphereGeometry(0.26, 10, 8), mHand);
    add(th1, armGeo(0.26, 0.24, 0.5), mHand);
    const th2 = joint('thumbb', th1, [0, -0.5, 0]);
    add(th2, armGeo(0.24, 0.21, 0.4), mHand); add(th2, new THREE.SphereGeometry(0.21, 10, 8), mHand, [0, -0.4, 0]);
    J.arm[side] = { sh, el, wr, fingers, thumb: [th1, th2], s };
  }
  // legs
  J.leg = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const hp = joint('hip' + side, J.hips, [s * 1.15, -0.3, 0]);
    add(hp, new THREE.SphereGeometry(0.62, 14, 10), brass);
    add(hp, armGeo(0.6, 0.6, 2.0), mLimb);
    const kn = joint('knee' + side, hp, [0, -2.0, 0]);
    add(kn, new THREE.SphereGeometry(0.6, 14, 10), brass);
    add(kn, armGeo(0.55, 0.6, 2.2), mLimb);
    const an = joint('ankle' + side, kn, [0, -2.2, 0]);
    const foot = joint('foot' + side, an, [0, 0, 0]);
    add(foot, new RoundedBoxGeometry(1.7, 0.75, 2.7, 3, 0.3), mFoot, [0, -0.32, 0.45]);
    J.leg[side] = { hp, kn, an, foot, s };
  }

  // ------- state application -------
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  function applyFingers(arm, f = {}) {
    const curl = f.curl ?? [0.2, 0.2, 0.2]; const spread = f.spread ?? 0.08;
    arm.fingers.forEach(([a, b], i) => { a.rotation.set(curl[i] * 1.2, 0, (i - 1) * spread * -arm.s, 'XYZ'); b.rotation.set(curl[i] * 1.35, 0, 0); });
    const t = f.thumb ?? 0.2;
    arm.thumb[0].rotation.set(0.5 + t * 0.6, 0, arm.s * (0.5 - t * 0.6), 'XYZ'); arm.thumb[1].rotation.set(t * 0.8, 0, 0);
  }
  function set(st) {
    const r = st.root || {};
    root.position.set(...(r.p || [0, 0, 0])); root.rotation.set(r.rx || 0, r.ry || 0, r.rz || 0, 'YXZ');
    const hp = st.hips || {};
    J.hips.position.set(hp.x || 0, 5.2 + (hp.y || 0), hp.z || 0); setRot(J.hips, hp.r);
    setRot(J.spine, st.spine); setRot(J.neck, st.neck); setRot(J.head, st.head);
    J.key.rotation.z = st.key || 0;
    const ears = st.ears || [0, 0]; J.ears[0].rotation.x = ears[0]; J.ears[1].rotation.x = ears[1];
    // eye stalk telescope
    const ext = st.stalk || 0;
    J.eyes[0].j.position.z = ext * 4.2;
    J.stalkRings.forEach((m, i) => { m.visible = ext > 0.01; m.position.z = (i + 0.5) / 7 * ext * 4.2; m.scale.setScalar(0.85 + 0.15 * Math.sin(i * 2.1)); });
    if (st.stalkRot) setRot(J.stalk, st.stalkRot); else J.stalk.rotation.set(0, 0, 0);
    // eyes
    const E = st.eyes || {};
    J.eyes.forEach((e, i) => {
      const o = { ...E, ...(i === 0 ? st.eyeL : st.eyeR) };
      const u = e.u;
      u.ap.value = o.ap ?? 0.7; u.glow.value = o.glow ?? 1; u.flicker.value = o.flicker ?? 1;
      u.lidUp.value = o.lidUp ?? 0.12; u.lidLo.value = o.lidLo ?? 0.0;
      // tilt mirrors per eye so "inner corner up" is symmetric
      const m = i === 0 ? 1 : -1;
      u.lidUpTilt.value = (o.lidUpTilt ?? 0) * m; u.lidLoTilt.value = (o.lidLoTilt ?? 0) * m;
      if (o.ambient) u.ambient.value.set(o.ambient);
      e.light.intensity = (o.beam ?? 0) * (o.glow ?? 1);
      e.light.angle = o.beamAngle ?? 0.42;
    });
    // odometer
    const v = st.counter ?? 41275;
    J.drums.forEach((d, k) => {
      const p = Math.pow(10, k); let pos = Math.floor(v / p) % 10;
      const rem = v % p; const roll = k === 0 ? v % 1 : Math.max(0, rem - (p - 1));
      pos = (k === 0 ? Math.floor(v) % 10 : pos) + (k === 0 ? v % 1 : roll);
      d.rotation.set(0, pos / 10 * Math.PI * 2 + (st.drumOffset ?? DRUM0), Math.PI / 2, 'ZXY');
    });
    root.updateMatrixWorld(true);
    // arms
    for (const side of ['L', 'R']) {
      const a = st['arm' + side]; const arm = J.arm[side];
      if (a && a.ik) {
        const pole = a.pole || V(arm.s * 8, 6, -6).applyMatrix4(root.matrixWorld);
        ik2(arm.sh, arm.el, 2.2, 2.0, a.ik, pole);
        arm.wr.position.set(0, -2.0, 0);
        if (a.handQ) setWorldQuat(arm.wr, a.handQ); else setRot(arm.wr, a.wr || [0, 0, 0]);
      } else if (a) { setRot(arm.sh, a.sh); setRot(arm.el, a.el); setRot(arm.wr, a.wr); }
      applyFingers(arm, (a && a.fingers) || {});
    }
    // legs (feet planted via IK when given)
    for (const side of ['L', 'R']) {
      const l = st['leg' + side]; const leg = J.leg[side];
      if (l && l.ik) {
        const pole = l.pole || V(leg.s * 0.5, 3, 10).applyMatrix4(root.matrixWorld);
        ik2(leg.hp, leg.kn, 2.0, 2.2, l.ik, pole);
        leg.an.position.set(0, -2.2, 0);
        tmpQ.setFromEuler(tmpE.set(l.footRx || 0, (r.ry || 0) + (l.footRy || 0), 0, 'YXZ'));
        setWorldQuat(leg.foot, tmpQ);
      } else if (l) { setRot(leg.hp, l.hp); setRot(leg.kn, l.kn); setRot(leg.foot, l.ft); }
    }
    root.updateMatrixWorld(true);
  }
  set({});
  return { root, J, set, meshes, ventWorld: () => J.vents.map((v) => v.getWorldPosition(new THREE.Vector3())) };
}
