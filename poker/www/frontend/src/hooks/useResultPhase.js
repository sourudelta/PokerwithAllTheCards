import { useEffect, useState } from 'react';
import { FLIP_STAGGER, FLIP_DURATION } from '../constants/animation';

const HAND_NAME_GAP = 900; // 自分の役名表示から相手の役名表示までの間隔(ms)

// ラウンド結果演出のフェーズを管理する: flip(相手カードめくり) → yourHand → opponentHand → modal
export function useResultPhase(active, opponentCardCount) {
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    setPhase(active ? 'flip' : 'idle');
  }, [active]);

  useEffect(() => {
    if (phase === 'flip') {
      const flipCount = Math.max(opponentCardCount, 1);
      const flipTotalMs = (FLIP_STAGGER * (flipCount - 1) + FLIP_DURATION) * 1000 + 300;
      const timer = setTimeout(() => setPhase('yourHand'), flipTotalMs);
      return () => clearTimeout(timer);
    }
    if (phase === 'yourHand') {
      const timer = setTimeout(() => setPhase('opponentHand'), HAND_NAME_GAP);
      return () => clearTimeout(timer);
    }
    if (phase === 'opponentHand') {
      const timer = setTimeout(() => setPhase('modal'), HAND_NAME_GAP);
      return () => clearTimeout(timer);
    }
  }, [phase, opponentCardCount]);

  return phase;
}
