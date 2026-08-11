import { useEffect, useState } from 'react';
import { CardItem } from './CardItem';

export function GameArea({
  round,
  yourCards,
  opponentCards,
  selectedIndices,
  onToggleCard,
  onConfirm,
  confirmDisabled,
}) {
  // 配布アニメーションを再生済みのindex集合。新しい手札が配られたらリセットする
  const [enteredIndices, setEnteredIndices] = useState(new Set());

  useEffect(() => {
    setEnteredIndices(new Set());
  }, [yourCards]);

  const markEntered = (index) => {
    setEnteredIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  };

  return (
    <div id="game-area" style={{ display: 'flex' }}>
      <div id="game-stats" style={{ display: 'block' }}>
        <p>
          ラウンド数: <span id="round-count">{round}</span>
        </p>
      </div>

      <div className="player-area">
        <h2>相手のカード</h2>
        <div id="opponent-cards" className="card-row">
          {opponentCards.map((card, i) => (
            <CardItem key={i} card={card} variant="opponent" />
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
                  onClick={() => onToggleCard(i)}
                />
              ),
          )}
        </div>
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
                  onClick={() => onToggleCard(i)}
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
