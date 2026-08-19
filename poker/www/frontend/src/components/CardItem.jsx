import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { SPECIAL_CARDS } from '../data/specialCards';
import { FLIP_DURATION } from '../constants/animation';

const CARD_BACK_IMAGE = 'images/Back4.png';

// variant: "hand"(自分の手札・配布アニメーションあり) | "selected"(選択済み) | "opponent"(相手のカード)
// entered: 手札としてこのindexが配布アニメーションを再生済みかどうか(選択解除で戻ってきた時に再生しないため親から渡す)
// card.Handed: サーバー側で既に配布済み(前ラウンドから持ち越し)のカードかどうか。trueなら配布アニメーションをスキップする
// flipDelay: 相手の出したカード限定。結果発表時に1枚ずつめくれる演出の開始遅延(秒)
export function CardItem({
  card,
  index = 0,
  variant,
  onClick,
  entered: enteredProp = false,
  onEntered,
  flipDelay = 0.5,
}) {
  const isHand = variant === 'hand';
  const isOpponent = variant === 'opponent';
  const skipEnterAnimation = enteredProp || card.Handed;
  const [entered, setEntered] = useState(!isHand || skipEnterAnimation);

  useEffect(() => {
    if (!isHand || skipEnterAnimation) return;
    const timer = setTimeout(() => {
      setEntered(true);
      onEntered?.(index);
    }, index * 200);
    return () => clearTimeout(timer);
  }, [isHand, index, skipEnterAnimation, onEntered]);

  const special = SPECIAL_CARDS[card.Value];
  const baseURL = `${location.protocol}//${location.host}/`;

  if (isOpponent) {
    return (
      <div className="card animate card--flip" onClick={onClick}>
        {special && <div className="tooltip">効果: {special.effect}</div>}
        <motion.div
          className="flip-card-inner"
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ delay: flipDelay, duration: FLIP_DURATION, ease: 'easeInOut' }}
        >
          <div className="flip-card-face flip-card-front">
            <img
              className="card-image"
              src={`${baseURL}${card.image}`}
              alt={`${card.Value} of ${card.Suit}`}
            />
          </div>
          <div className="flip-card-face flip-card-back">
            <img className="card-image" src={`${baseURL}${CARD_BACK_IMAGE}`} alt="card back" />
          </div>
        </motion.div>
      </div>
    );
  }

  const classNames = ['card'];
  if (entered) classNames.push('animate');
  if (variant === 'selected') classNames.push('selected');

  const style = isHand
    ? {
        transform: entered ? 'translateX(0) translateY(0)' : 'translateX(-350px) translateY(600px)',
        transition: entered ? 'transform 0.5s ease-in-out, opacity 0.5s ease-in-out' : undefined,
      }
    : undefined;

  return (
    <div className={classNames.join(' ')} style={style} onClick={onClick}>
      {special && <div className="tooltip">効果: {special.effect}</div>}
      <img
        className="card-image"
        src={`${baseURL}${card.image}`}
        alt={`${card.Value} of ${card.Suit}`}
      />
    </div>
  );
}
