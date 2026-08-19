import { useCallback, useEffect, useState } from 'react';
import { CardItem } from './CardItem';
import { HandNameTag } from './HandNameTag';
import { FLIP_STAGGER } from '../constants/animation';

export function GameArea({
  round,
  yourCards,
  opponentCards,
  selectedIndices,
  onToggleCard,
  onConfirm,
  confirmDisabled,
  yourHandName,
  opponentHandName,
}) {
  // 配布アニメーションを再生済みのindex集合。新しい手札が配られたらリセットする
  const [enteredIndices, setEnteredIndices] = useState(new Set());

  useEffect(() => {
    setEnteredIndices(new Set());
  }, [yourCards]);

  // useCallbackで参照を固定する。ここが再レンダリングのたびに新しい関数になると、
  // CardItem側のuseEffect(依存配列にonEnteredを含む)が毎回再実行されてタイマーが
  // リセットされ、カードが1枚配られるたびに残りのカードの配布アニメーションが遅延してしまう。
  const markEntered = useCallback((index) => {
    setEnteredIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, []);

  // 選択/選択解除の操作をした時点で登場済み扱いにする。
  // こうしないと配布アニメーション再生中に選択→解除すると、CardItemがアンマウントされて
  // setTimeoutがキャンセルされ、手札に戻った時に再びアニメーションしてしまう。
  const handleToggle = useCallback(
    (index) => {
      markEntered(index);
      onToggleCard(index);
    },
    [markEntered, onToggleCard],
  );

  return (
    <div id="game-area" style={{ display: 'flex' }}>
      <div id="game-stats" style={{ display: 'block' }}>
        <p>
          ラウンド数: <span id="round-count">{round}</span>
        </p>
      </div>

      <div className="player-area">
        <h2>相手のカード</h2>
        {opponentHandName && <HandNameTag label="相手の役" name={opponentHandName} />}
        <div id="opponent-cards" className="card-row">
          {opponentCards.map((card, i) => (
            <CardItem key={i} card={card} variant="opponent" flipDelay={i * FLIP_STAGGER} />
          ))}
        </div>
      </div>

      <div className="player-area">
        <h2>選択中のカード</h2>
        <div id="selected-cards" className="card-row">
          {yourCards.map(
            (card, i) =>
              selectedIndices.has(i) && (
                <CardItem
                  key={i}
                  card={card}
                  variant="selected"
                  onClick={() => handleToggle(i)}
                />
              ),
          )}
        </div>
        {yourHandName && <HandNameTag label="あなたの役" name={yourHandName} />}
      </div>

      <div className="player-area">
        <h2>手札</h2>
        <div id="your-cards" className="card-row">
          {yourCards.map(
            (card, i) =>
              !selectedIndices.has(i) && (
                <CardItem
                  key={i}
                  card={card}
                  variant="hand"
                  index={i}
                  entered={enteredIndices.has(i)}
                  onEntered={markEntered}
                  onClick={() => handleToggle(i)}
                />
              ),
          )}
        </div>
        <button disabled={confirmDisabled} onClick={onConfirm}>
          準備OK
        </button>
      </div>
    </div>
  );
}
