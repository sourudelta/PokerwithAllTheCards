import { useEffect, useState } from 'react';
import { SPECIAL_CARDS } from '../data/specialCards';

// variant: "hand"(自分の手札・配布アニメーションあり) | "selected"(選択済み) | "opponent"(相手のカード)
// entered: 手札としてこのindexが配布アニメーションを再生済みかどうか(選択解除で戻ってきた時に再生しないため親から渡す)
// card.Handed: サーバー側で既に配布済み(前ラウンドから持ち越し)のカードかどうか。trueなら配布アニメーションをスキップする
export function CardItem({ card, index = 0, variant, onClick, entered: enteredProp = false, onEntered }) {
  const isHand = variant === 'hand';
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
