// Renderer + post wrapper shared by the film and the look-dev pages.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Post } from './post.js';

export class Engine {
  constructor(w = 1920, h = 1080) {
    this.w = w; this.h = h;
    const r = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(w, h);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // final pass does tonemap + sRGB itself
    document.body.appendChild(r.domElement);
    this.renderer = r;
    this.post = new Post(r, w, h);
    const pm = new THREE.PMREMGenerator(r);
    this.envRoom = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  render(scene, camera, p) { this.post.render(scene, camera, p); }
  sync() { const gl = this.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
}
