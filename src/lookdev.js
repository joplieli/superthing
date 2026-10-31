import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { createHob } from './assets/hob.js';
import { woodTex } from './core/tex.js';
import { V } from './core/rig.js';
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 960), H = +(Q.get('h') || 540);
const eng = new Engine(W, H);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#151a2c');
const cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 500);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: woodTex('#6b4a33', 3, 8, 8), roughness: 0.75 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(200, 100), new THREE.MeshStandardMaterial({ color: '#2a2f45', roughness: 0.9 }));
wall.position.set(0, 50, -30); wall.receiveShadow = true; scene.add(wall);
const hob = createHob(eng.envRoom); scene.add(hob.root);
const moon = new THREE.DirectionalLight('#8fa6e8', 1.6); moon.position.set(-30, 40, 20); moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 25, bottom: -5, near: 1, far: 120 }); moon.shadow.radius = 3; moon.shadow.bias = -0.0008;
scene.add(moon);
const lamp = new THREE.PointLight('#ffb35c', 90, 80, 2); lamp.position.set(12, 14, 14); lamp.castShadow = true; lamp.shadow.mapSize.set(512, 512); lamp.shadow.radius = 4; lamp.shadow.bias = -0.002; scene.add(lamp);
scene.add(new THREE.HemisphereLight('#3a4670', '#1a120c', 0.7));
const mode = Q.get('mode') || 'turn';
window.renderFrame = async (f) => {
  const t = f / 24;
  let st = {};
  if (mode === 'turn') {
    const a = f * 0.6;
    cam.position.set(Math.sin(a) * 34, 12, Math.cos(a) * 34); cam.lookAt(0, 7.5, 0);
    st = { eyes: { ap: 0.6 + 0.3 * Math.sin(t * 2), glow: 1.0, lidUp: 0.2, lidUpTilt: 0.25 }, key: t, counter: 41275 + Math.min(1, t * 0.5) };
  } else if (mode === 'face') {
    cam.position.set(3, 12.5, 16); cam.lookAt(0, 11.0, 0);
    const ex = [
      { ap: 0.35, glow: 1.15, lidUp: 0.35, lidUpTilt: -0.35 },
      { ap: 0.25, glow: 1.4, lidUp: 0.0, lidUpTilt: 0 },
      { ap: 0.5, glow: 0.9, lidUp: 0.3, lidUpTilt: 0.45 },
      { ap: 0.85, glow: 0.8, lidUp: 0.42, lidUpTilt: 0.1, lidLo: 0.18 },
    ][f % 4];
    st = { eyes: ex, head: [0.05, 0.25, 0.08 * (f % 2 ? 1 : -1)], stalk: f >= 4 ? 0.8 : 0, counter: 41275 };
  } else if (mode === 'hold') {
    cam.position.set(22, 10, 26); cam.lookAt(0, 7, 0);
    const handle = V(0, 7.2, 6.5);
    st = { hips: { y: -0.7, r: [0.18, 0, 0] }, spine: [0.22, 0, 0], head: [-0.1, 0, 0],
      armL: { ik: handle.clone().add(V(0.9, 0, 0)), wr: [0, 0, 0], fingers: { curl: [0.9, 0.9, 0.9], thumb: 0.8 } },
      armR: { ik: handle.clone().add(V(-0.9, 0, 0)), wr: [0, 0, 0], fingers: { curl: [0.9, 0.9, 0.9], thumb: 0.8 } },
      legL: { ik: V(1.6, 0.7, 1.5) }, legR: { ik: V(-1.4, 0.7, -2.2) }, eyes: { ap: 0.35, lidUp: 0.35, lidUpTilt: -0.3 } };
  }
  hob.set(st);
  eng.render(scene, cam, { aperture: Q.get('ap') ? +Q.get('ap') : 0, focus: 34, maxCoc: 10, bloom: 0.35, bloomThreshold: 1.4, halation: 0.15, exposure: 1.1, frame: f, grain: 0.03, vignette: 0.3, saturation: 1.05, contrast: 1.05 });
  eng.sync();
};
window.READY = true;
