import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { LightningBolt } from './LightningBolt';

const STRIKE_STAGGER_MS = 140;
const IGNITE_DELAY_MS = 180;
const TAIL_BUFFER_MS = 900; // 最後の着弾後、波紋と燃焼が収まるまでの余裕

// R3Fはorthographic=trueの時、キャンバスのピクセルサイズそのままを座標系にする
// (中心が原点、Yは上向き)。DOMの矩形をそのままThree座標へ変換できるので、
// パース無しの2D画面にオーバーレイするVFXにはorthographicカメラが向いている。
function domRectToThree(rect, containerRect) {
  const centerX = rect.left + rect.width / 2 - (containerRect.left + containerRect.width / 2);
  const centerY = rect.top + rect.height / 2 - (containerRect.top + containerRect.height / 2);
  return [centerX, -centerY, 0];
}

// 相手の手札破壊演出(destroy_opponent_cards)。containerRef配下に実際に表示されている
// カード要素(cardRefs.current = { [id]: HTMLElement })へ向けて上空から雷を落とし、
// 着弾のタイミングでonIgniteを呼ぶ。見た目(焦げて消える)はCSS側の.card--burningが担当するので、
// 呼び出し側はonIgniteを受けてそのカードへ.card--burningを付与するだけでよい。
export function CardDestroyEffect({ trigger, containerRef, cardRefs, onIgnite, onComplete }) {
  const [strikes, setStrikes] = useState({});

  useEffect(() => {
    if (!trigger) return undefined;
    setStrikes({});

    const ids = Object.keys(cardRefs.current ?? {});
    const timers = [];

    ids.forEach((id, order) => {
      const timer = window.setTimeout(() => {
        const cardEl = cardRefs.current?.[id];
        const container = containerRef.current;
        if (!cardEl || !container) return;

        const rect = cardEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const [x, y] = domRectToThree(rect, containerRect);

        setStrikes((prev) => ({ ...prev, [id]: { token: Date.now() + order + 1, x, y } }));

        const igniteTimer = window.setTimeout(() => onIgnite?.(id), IGNITE_DELAY_MS);
        timers.push(igniteTimer);
      }, order * STRIKE_STAGGER_MS);
      timers.push(timer);
    });

    const totalMs = Math.max(0, ids.length - 1) * STRIKE_STAGGER_MS + IGNITE_DELAY_MS + TAIL_BUFFER_MS;
    const completeTimer = window.setTimeout(() => {
      setStrikes({});
      onComplete?.();
    }, totalMs);
    timers.push(completeTimer);

    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (Object.keys(strikes).length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      <Canvas orthographic gl={{ alpha: true }} style={{ background: 'transparent' }}>
        {Object.entries(strikes).map(([id, strike]) => (
          <LightningBolt
            key={id}
            strikeId={strike.token}
            start={[strike.x, 260, 0]}
            end={[strike.x, strike.y, 0]}
            radius={2.5}
            branchRadius={1.2}
            jitter={28}
            branchJitter={16}
            branchReach={50}
            branchDropMin={25}
            branchDropRange={35}
            ringInner={10}
            ringOuter={13}
            ringBaseScale={0.6}
            ringGrowScale={4.5}
            ringDuration={0.5}
            rippleCount={3}
            rippleStagger={0.12}
            ringRotation={[0, 0, 0]}
            lightDistance={400}
            lightIntensity={25}
          />
        ))}
        <EffectComposer>
          <Bloom intensity={1.6} luminanceThreshold={0.1} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
