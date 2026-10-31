// Custom post pipeline tuned for SwiftShader: half-res gather DOF, quarter-res bloom chain,
// then one final pass with halation, grade, filmic tonemap, CA, vignette and grain.
import * as THREE from 'three';

const VS = /* glsl */`
out vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsQuad() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.Mesh(g); m.frustumCulled = false; return m;
}
function mat(fs, uniforms) {
  return new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: 'precision highp float;\nin vec3 position;\n' + VS, fragmentShader: 'precision highp float;\n' + fs, uniforms, depthTest: false, depthWrite: false });
}

const COC_FS = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel;
uniform float near, far, focus, aperture, maxCoc;
float lin(float d){ return near * far / (far - d * (far - near)); }
float coc(float d){ float z = lin(d); return clamp(aperture * (z - focus) / z, -maxCoc, maxCoc); }
void main(){
  // 4 taps of the full-res buffer -> one half-res texel; keep the strongest near CoC so
  // foreground edges blur outward instead of being cut.
  vec2 o1 = texel * 0.5;
  vec2 uv[4] = vec2[4](vUv + vec2(-o1.x,-o1.y), vUv + vec2(o1.x,-o1.y), vUv + vec2(-o1.x,o1.y), vUv + vec2(o1.x,o1.y));
  vec3 c = vec3(0.0); float cc = 0.0; float nearest = 0.0;
  for(int i=0;i<4;i++){ c += texture(tColor, uv[i]).rgb; float k = coc(texture(tDepth, uv[i]).r); cc += k; nearest = min(nearest, k); }
  c *= 0.25; cc *= 0.25;
  float outC = nearest < cc - 0.5 ? nearest : cc;
  o = vec4(c, outC);
}`;

const BOKEH_FS = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tCoc; uniform vec2 texel; uniform float maxCoc;
const int N = 36;
void main(){
  vec4 center = texture(tCoc, vUv);
  float cr = abs(center.a);
  vec3 acc = center.rgb; float wsum = 1.0;
  float ga = 2.39996323;
  for(int i=1;i<N;i++){
    float r = sqrt(float(i) / float(N)) * maxCoc;
    float a = float(i) * ga;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec4 s = texture(tCoc, vUv + off * texel);
    float sc = abs(s.a);
    // a sample contributes if its own blur disc reaches us (handles fg over bg),
    // background samples are limited by our own CoC (prevents sharp fg from bleeding).
    float reach = s.a < center.a ? sc : min(sc, cr);
    float w = smoothstep(r - 1.0, r + 0.5, reach);
    // bright highlights get a touch more weight -> bokeh discs pop
    float l = dot(s.rgb, vec3(0.299,0.587,0.114));
    w *= 1.0 + 0.6 * smoothstep(0.8, 3.0, l);
    acc += s.rgb * w; wsum += w;
  }
  o = vec4(acc / wsum, cr);
}`;

const COMPOSE_FS = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tColor; uniform sampler2D tBokeh; uniform sampler2D tDepth;
uniform float near, far, focus, aperture, maxCoc;
float lin(float d){ return near * far / (far - d * (far - near)); }
void main(){
  vec3 sharp = texture(tColor, vUv).rgb;
  vec4 b = texture(tBokeh, vUv);
  float z = lin(texture(tDepth, vUv).r);
  float c = abs(clamp(aperture * (z - focus) / z, -maxCoc, maxCoc));
  float m = max(smoothstep(0.35, 1.6, c), smoothstep(0.6, 2.2, b.a) * step(z, focus));
  o = vec4(mix(sharp, b.rgb, m), 1.0);
}`;

const BRIGHT_FS = /* glsl */`
in vec2 vUv; out vec4 o; uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold;
void main(){
  vec3 c = vec3(0.0);
  c += texture(tSrc, vUv + texel * vec2(-1.0,-1.0)).rgb; c += texture(tSrc, vUv + texel * vec2(1.0,-1.0)).rgb;
  c += texture(tSrc, vUv + texel * vec2(-1.0,1.0)).rgb; c += texture(tSrc, vUv + texel * vec2(1.0,1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold * 2.0 + 0.2, l);
  o = vec4(c * k, 1.0);
}`;

const BLUR_FS = /* glsl */`
in vec2 vUv; out vec4 o; uniform sampler2D tSrc; uniform vec2 dir;
void main(){
  vec3 c = texture(tSrc, vUv).rgb * 0.2270270;
  c += texture(tSrc, vUv + dir * 1.3846153).rgb * 0.3162162; c += texture(tSrc, vUv - dir * 1.3846153).rgb * 0.3162162;
  c += texture(tSrc, vUv + dir * 3.2307692).rgb * 0.0702703; c += texture(tSrc, vUv - dir * 3.2307692).rgb * 0.0702703;
  o = vec4(c, 1.0);
}`;

const FINAL_FS = /* glsl */`
in vec2 vUv; out vec4 o;
uniform sampler2D tColor; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;
uniform sampler2D tOverlay; uniform float overlayOn;
uniform float bloom, halation, exposure, saturation, contrast, vignette, grain, ca, frame, fade;
uniform vec3 lift, gamma, gain, tint;
uniform vec2 res;
float hash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vUv;
  vec2 dc = uv - 0.5;
  float r2 = dot(dc, dc);
  // lateral chromatic aberration grows towards the frame edge
  vec2 caOff = dc * r2 * ca;
  vec3 col;
  col.r = texture(tColor, uv - caOff).r;
  col.g = texture(tColor, uv).g;
  col.b = texture(tColor, uv + caOff).b;
  vec3 b = texture(tB0, uv).rgb * 0.5 + texture(tB1, uv).rgb * 0.8 + texture(tB2, uv).rgb * 1.0 + texture(tB3, uv).rgb * 1.2;
  col += b * bloom;
  // halation: film's red-orange glow around hot highlights
  vec3 hal = texture(tB1, uv).rgb + texture(tB2, uv).rgb;
  col += hal * vec3(1.0, 0.38, 0.12) * halation;
  col *= exposure * tint;
  col = aces(col);
  // lift / gamma / gain grade in display-ish space
  col = pow(max(col, 0.0), 1.0 / gamma);
  col = col * gain + lift * (1.0 - col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col *= mix(1.0, smoothstep(0.95, 0.15, length(dc * vec2(1.0, 0.82))), vignette);
  col = clamp(col, 0.0, 1.0);
  vec3 srgb = toSRGB(col);
  if (overlayOn > 0.5) { vec4 ov = texture(tOverlay, vec2(uv.x, 1.0 - uv.y)); srgb = mix(srgb, ov.rgb, ov.a); }
  srgb *= fade;
  // luma-weighted animated grain + dither (stronger in mids, like film)
  float n = hash(vec3(gl_FragCoord.xy, frame)) + hash(vec3(gl_FragCoord.xy * 1.7 + 13.0, frame + 0.5)) - 1.0;
  float lw = 1.0 - abs(dot(srgb, vec3(0.333)) - 0.45) * 1.4;
  srgb += n * grain * max(lw, 0.25);
  srgb += (hash(vec3(gl_FragCoord.xy, frame + 7.0)) - 0.5) / 255.0;
  o = vec4(srgb, 1.0);
}`;

export class Post {
  constructor(renderer, w, h) {
    this.r = renderer; this.w = w; this.h = h;
    const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.main = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    this.main.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    this.main.depthTexture.format = THREE.DepthFormat;
    this.msaa = null;
    this.cocRT = new THREE.WebGLRenderTarget(w / 2, h / 2, hf);
    this.bokehRT = new THREE.WebGLRenderTarget(w / 2, h / 2, hf);
    this.dofRT = new THREE.WebGLRenderTarget(w, h, hf);
    this.bl = [];
    let bw = w / 4, bh = h / 4;
    for (let i = 0; i < 4; i++) { this.bl.push([new THREE.WebGLRenderTarget(bw, bh, hf), new THREE.WebGLRenderTarget(bw, bh, hf)]); bw = Math.max(8, Math.round(bw / 2)); bh = Math.max(8, Math.round(bh / 2)); }
    this.quad = fsQuad(); this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.Camera();
    const dofU = () => ({ near: { value: 0.1 }, far: { value: 100 }, focus: { value: 10 }, aperture: { value: 0 }, maxCoc: { value: 12 } });
    this.mCoc = mat(COC_FS, { tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2(1 / w, 1 / h) }, ...dofU() });
    this.mBokeh = mat(BOKEH_FS, { tCoc: { value: null }, texel: { value: new THREE.Vector2(2 / w, 2 / h) }, maxCoc: { value: 12 } });
    this.mCompose = mat(COMPOSE_FS, { tColor: { value: null }, tBokeh: { value: null }, tDepth: { value: null }, ...dofU() });
    this.mBright = mat(BRIGHT_FS, { tSrc: { value: null }, texel: { value: new THREE.Vector2(1 / w, 1 / h) }, threshold: { value: 1.0 } });
    this.mBlur = mat(BLUR_FS, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mFinal = mat(FINAL_FS, {
      tColor: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
      tOverlay: { value: null }, overlayOn: { value: 0 },
      bloom: { value: 0.6 }, halation: { value: 0.15 }, exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 },
      vignette: { value: 0.35 }, grain: { value: 0.035 }, ca: { value: 0.006 }, frame: { value: 0 }, fade: { value: 1 },
      lift: { value: new THREE.Vector3(0, 0, 0) }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
      tint: { value: new THREE.Vector3(1, 1, 1) }, res: { value: new THREE.Vector2(w, h) },
    });
  }
  pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.qs, this.qc); }
  render(scene, camera, p = {}) {
    const r = this.r;
    r.setRenderTarget(this.main); r.clear(); r.render(scene, camera);
    let src = this.main.texture;
    const ap = p.aperture || 0;
    if (ap > 0) {
      for (const m of [this.mCoc, this.mCompose]) {
        m.uniforms.near.value = camera.near; m.uniforms.far.value = camera.far;
        m.uniforms.focus.value = p.focus; m.uniforms.aperture.value = ap; m.uniforms.maxCoc.value = p.maxCoc || 12;
      }
      this.mBokeh.uniforms.maxCoc.value = (p.maxCoc || 12);
      this.mCoc.uniforms.tColor.value = src; this.mCoc.uniforms.tDepth.value = this.main.depthTexture; this.pass(this.mCoc, this.cocRT);
      this.mBokeh.uniforms.tCoc.value = this.cocRT.texture; this.pass(this.mBokeh, this.bokehRT);
      this.mCompose.uniforms.tColor.value = src; this.mCompose.uniforms.tBokeh.value = this.bokehRT.texture; this.mCompose.uniforms.tDepth.value = this.main.depthTexture;
      this.pass(this.mCompose, this.dofRT); src = this.dofRT.texture;
    }
    // bloom chain
    this.mBright.uniforms.tSrc.value = src; this.mBright.uniforms.threshold.value = p.bloomThreshold ?? 0.9;
    this.mBright.uniforms.texel.value.set(1 / this.w, 1 / this.h);
    this.pass(this.mBright, this.bl[0][0]);
    for (let i = 0; i < this.bl.length; i++) {
      const [a, b] = this.bl[i];
      if (i > 0) { this.mBlur.uniforms.tSrc.value = this.bl[i - 1][0].texture; this.mBlur.uniforms.dir.value.set(0, 0); this.pass(this.mBlur, a); }
      this.mBlur.uniforms.tSrc.value = a.texture; this.mBlur.uniforms.dir.value.set(1 / a.width, 0); this.pass(this.mBlur, b);
      this.mBlur.uniforms.tSrc.value = b.texture; this.mBlur.uniforms.dir.value.set(0, 1 / a.height); this.pass(this.mBlur, a);
    }
    const u = this.mFinal.uniforms;
    u.tColor.value = src; u.tB0.value = this.bl[0][0].texture; u.tB1.value = this.bl[1][0].texture; u.tB2.value = this.bl[2][0].texture; u.tB3.value = this.bl[3][0].texture;
    for (const k of ['bloom', 'halation', 'exposure', 'saturation', 'contrast', 'vignette', 'grain', 'ca', 'frame', 'fade']) if (p[k] !== undefined) u[k].value = p[k];
    for (const k of ['lift', 'gamma', 'gain', 'tint']) if (p[k]) u[k].value.set(...p[k]);
    if (p.overlay) { u.tOverlay.value = p.overlay; u.overlayOn.value = 1; } else u.overlayOn.value = 0;
    this.pass(this.mFinal, null);
  }
}
