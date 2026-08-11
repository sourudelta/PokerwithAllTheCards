import { useEffect } from 'react';
import confetti from 'canvas-confetti';

export function FinalResultModal({ winCount, lossCount, drawCount }) {
  useEffect(() => {
    if (winCount <= lossCount) return;

    const duration = 3 * 1000;
    const end = Date.now() + duration;
    let frameId;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#bb0000', '#ffffff', '#ffd700'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#bb0000', '#ffffff', '#ffd700'],
      });

      if (Date.now() < end) {
        frameId = requestAnimationFrame(frame);
      }
    })();

    return () => cancelAnimationFrame(frameId);
  }, [winCount, lossCount]);

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>全5ラウンド終了！</h2>
        <p>
          戦績: {winCount}勝 {lossCount}敗 {drawCount}分
        </p>
        <button onClick={() => location.reload()}>もう一度遊ぶ</button>
      </div>
    </div>
  );
}
