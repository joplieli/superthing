// Minimal skeletal rig helpers: joints are Object3Ds; limbs point down local -Y.
import * as THREE from 'three';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function joint(name, parent, pos = [0, 0, 0]) {
  const o = new THREE.Object3D(); o.name = name; o.position.set(...pos); if (parent) parent.add(o); return o;
}

export function setRot(o, r) { if (!r) return; o.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0, 'YXZ'); }

// Orient joint `o` (whose limb points along local -Y, bend axis local X) so that the limb
// points at world position `target`, with local X aligned to `bendAxis` (world).
export function aimWorld(o, target, bendAxis) {
  o.parent.updateWorldMatrix(true, false);
  const S = o.getWorldPosition(_v1);
  const y = _v2.copy(S).sub(target).normalize(); // local +Y = away from target
  const x = _v3.copy(bendAxis).addScaledVector(y, -bendAxis.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  _m.makeBasis(x, y, z); _q.setFromRotationMatrix(_m);
  o.parent.getWorldQuaternion(_qp).invert();
  o.quaternion.copy(_qp.multiply(_q));
  o.updateWorldMatrix(false, false);
}

// Analytic two-bone IK. upper at joint A, lower at joint B (child of upper at -lenA along Y).
// pole: world point the knee/elbow should bend towards.
export function ik2(upper, lower, lenA, lenB, target, pole) {
  upper.parent.updateWorldMatrix(true, false);
  const S = upper.getWorldPosition(new THREE.Vector3());
  const T = target.clone();
  let d = T.distanceTo(S);
  const maxD = (lenA + lenB) * 0.9995, minD = Math.abs(lenA - lenB) + 1e-3;
  const dir = T.clone().sub(S).normalize();
  d = Math.min(maxD, Math.max(minD, d));
  const ca = (lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d);
  const a = Math.acos(Math.min(1, Math.max(-1, ca)));
  const toPole = pole.clone().sub(S);
  let n = new THREE.Vector3().crossVectors(dir, toPole);
  if (n.lengthSq() < 1e-8) n.set(1, 0, 0); n.normalize();
  const b = new THREE.Vector3().crossVectors(n, dir).normalize();
  const E = S.clone().addScaledVector(dir, Math.cos(a) * lenA).addScaledVector(b, Math.sin(a) * lenA);
  const Tc = S.clone().addScaledVector(dir, d);
  aimWorld(upper, E, n);
  lower.position.set(0, -lenA, 0);
  aimWorld(lower, Tc, n);
  return { elbow: E, reach: d / (lenA + lenB) };
}

// Rotate a joint so its world quaternion matches q (world)
export function setWorldQuat(o, q) {
  o.parent.updateWorldMatrix(true, false);
  o.parent.getWorldQuaternion(_qp).invert();
  o.quaternion.copy(_qp.multiply(q));
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
