import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateBoltPoints } from './generateBoltPoints';

const DURATION = 0.55;
const FLICKER_END = 0.22;

function makeTube(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
  const tubularSegments = Math.max(8, points.length * 2);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, 6, false);
}

// strikeId が変わるたびに新しい雷ジオメトリを生成し、短いフリッカー→フェードアウトを再生する。
// radius系のpropはワールド単位(通常のR3Fシーン)でもピクセル単位(2D画面へのオーバーレイ)でも
// 使い回せるように、スケール依存の値を外からすべて渡せるようにしてある。
export function LightningBolt({
  start,
  end,
  strikeId,
  color = '#bfe8ff',
  radius = 0.035,
  branchRadius = 0.015,
  jitter = 0.9,
  branchJitter = 0.5,
  branchReach = 1.6,
  branchDropMin = 0.8,
  branchDropRange = 1.2,
  ringInner = 0.4,
  ringOuter = 0.55,
  ringBaseScale = 0.3,
  ringGrowScale = 3.2,
  ringDuration = 0.35,
  rippleCount = 1,
  rippleStagger = 0.09,
  ringRotation = [-Math.PI / 2, 0, 0],
  lightDistance = 6,
  lightIntensity = 18,
}) {
  const groupRef = useRef(null);
  const lightRef = useRef(null);
  const ringRefs = useRef([]);
  const startTimeRef = useRef(0);

  const { mainGeometry, branchGeometries } = useMemo(() => {
    if (!strikeId) return { mainGeometry: null, branchGeometries: [] };

    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const points = generateBoltPoints(startVec, endVec, { segments: 16, jitter, seed: strikeId });
    const main = makeTube(points, radius);

    const branches = [];
    const branchCount = 2 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branchCount; b += 1) {
      const originIndex = 4 + Math.floor(Math.random() * Math.max(1, points.length - 8));
      const origin = points[originIndex];
      const branchEnd = origin
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * branchReach,
            -(branchDropMin + Math.random() * branchDropRange),
            (Math.random() - 0.5) * branchReach,
          ),
        );
      const branchPoints = generateBoltPoints(origin, branchEnd, {
        segments: 6,
        jitter: branchJitter,
        seed: strikeId * 10 + b + 1,
      });
      branches.push(makeTube(branchPoints, branchRadius));
    }

    return { mainGeometry: main, branchGeometries: branches };
  }, [strikeId, start, end, radius, branchRadius, jitter, branchJitter, branchReach, branchDropMin, branchDropRange]);

  useEffect(() => {
    if (strikeId) startTimeRef.current = performance.now();
  }, [strikeId]);

  useFrame(() => {
    if (!groupRef.current || !strikeId) return;
    const t = (performance.now() - startTimeRef.current) / 1000;

    let opacity;
    if (t < FLICKER_END) {
      opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 60));
    } else if (t < DURATION) {
      opacity = 1 - (t - FLICKER_END) / (DURATION - FLICKER_END);
    } else {
      opacity = 0;
    }

    groupRef.current.visible = opacity > 0.001;
    groupRef.current.traverse((obj) => {
      if (obj.material) obj.material.opacity = opacity;
    });

    if (lightRef.current) lightRef.current.intensity = opacity * lightIntensity;

    // 着弾の波紋。雷本体とは別のタイムラインで、少しずつ遅れて複数リングを広げてフェードさせる。
    ringRefs.current.forEach((ring, i) => {
      if (!ring) return;
      const localT = t - i * rippleStagger;
      if (localT < 0) {
        ring.visible = false;
        return;
      }
      ring.visible = true;
      const ringT = Math.min(1, localT / ringDuration);
      ring.scale.setScalar(ringBaseScale + ringT * ringGrowScale);
      ring.material.opacity = Math.max(0, 1 - ringT) * 0.8;
    });
  });

  if (!mainGeometry) return null;

  return (
    <group ref={groupRef}>
      <mesh geometry={mainGeometry}>
        <meshBasicMaterial color={color} transparent blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {branchGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshBasicMaterial color={color} transparent opacity={0.7} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
      <pointLight ref={lightRef} position={end} color={color} distance={lightDistance} decay={2} />
      {Array.from({ length: rippleCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          position={end}
          rotation={ringRotation}
        >
          <ringGeometry args={[ringInner, ringOuter, 32]} />
          <meshBasicMaterial color={color} transparent blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
