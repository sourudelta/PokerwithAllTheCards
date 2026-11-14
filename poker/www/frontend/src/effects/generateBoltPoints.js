import * as THREE from 'three';

function mulberry32(seed) {
  let t = seed;
  return function random() {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// 開始点と終了点の間をジグザグに揺らした点列を作る(古典的なfractal lightningの簡易版)。
// 両端は揺らさず、中間ほど揺れ幅を大きくする(sinのfalloff)ことで自然な稲妻の形になる。
export function generateBoltPoints(start, end, { segments = 14, jitter = 1, seed } = {}) {
  const random = mulberry32(seed ?? Math.floor(Math.random() * 1e9));
  const points = [start.clone()];
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const point = new THREE.Vector3().lerpVectors(start, end, t);
    const falloff = Math.sin(Math.PI * t);
    const amp = jitter * falloff;
    point.x += (random() - 0.5) * amp;
    point.z += (random() - 0.5) * amp;
    points.push(point);
  }
  points.push(end.clone());
  return points;
}
