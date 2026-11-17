import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { DICE_ROLL_MS } from '../constants/animation';

// 3x3のマス(0〜8)のうち、各出目で目(ピップ)を置く位置
const PIP_POSITIONS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const randomFace = () => Math.floor(Math.random() * 6) + 1;

function Die({ value, rolling, winner, loser }) {
  const classNames = ['die'];
  if (winner) classNames.push('die--winner');
  if (loser) classNames.push('die--loser');
  return (
    <motion.div
      className={classNames.join(' ')}
      animate={
        rolling
          ? { rotate: [0, 90, 180, 270, 360], y: [0, -24, 0, -12, 0] }
          : { rotate: 0, y: 0, scale: winner ? 1.15 : 1 }
      }
      transition={
        rolling
          ? { duration: 0.45, repeat: Infinity, ease: 'linear' }
          : { type: 'spring', stiffness: 300, damping: 12 }
      }
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIP_POSITIONS[value].includes(i) ? 'pip' : 'pip pip--empty'} />
      ))}
    </motion.div>
  );
}

// ルール変更カードが競合した時のサイコロ演出。両者のサイコロを転がし、サーバーが決めた出目で止める
// dice: { yours, opponent, yoursApplied }
export function DiceRollEffect({ dice, ruleDescription }) {
  const [rolling, setRolling] = useState(true);
  const [faces, setFaces] = useState({ yours: randomFace(), opponent: randomFace() });

  useEffect(() => {
    const interval = setInterval(() => {
      setFaces({ yours: randomFace(), opponent: randomFace() });
    }, 90);
    const stop = setTimeout(() => {
      clearInterval(interval);
      setFaces({ yours: dice.yours, opponent: dice.opponent });
      setRolling(false);
    }, DICE_ROLL_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [dice]);

  return (
    <motion.div
      className="dice-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className="dice-panel">
        <h2>ルールが競合!</h2>
        <p>サイコロで適用するルールを決めます</p>
        <div className="dice-row">
          <div className="dice-player">
            <span>相手</span>
            <Die
              value={faces.opponent}
              rolling={rolling}
              winner={!rolling && !dice.yoursApplied}
              loser={!rolling && dice.yoursApplied}
            />
          </div>
          <div className="dice-vs">VS</div>
          <div className="dice-player">
            <span>あなた</span>
            <Die
              value={faces.yours}
              rolling={rolling}
              winner={!rolling && dice.yoursApplied}
              loser={!rolling && !dice.yoursApplied}
            />
          </div>
        </div>
        {!rolling && (
          <motion.p
            className="dice-result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {dice.yoursApplied ? 'あなた' : '相手'}のルールを適用!
            <br />
            {ruleDescription}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
