// バックエンド(internal/models/cards.go の EvaluateHand)と同じロジックで
// 選択されたカードから役を判定し、結果表示用の日本語名を返す
const HAND_NAMES = [
  'ハイカード',
  'ワンペア',
  'ツーペア',
  'スリーカード',
  'ストレート',
  'フラッシュ',
  'フルハウス',
  'フォーカード',
  'ストレートフラッシュ',
];

function evaluateHandRank(cards) {
  const suitCounts = {};
  const valueCounts = {};
  const valueList = [];

  for (const card of cards) {
    suitCounts[card.Suit] = (suitCounts[card.Suit] || 0) + 1;
    valueCounts[card.Value] = (valueCounts[card.Value] || 0) + 1;
    valueList.push(card.Value);
  }
  valueList.sort((a, b) => a - b);

  const isFlush = Object.keys(suitCounts).length === 1;
  let isStraight = valueList.length > 1;
  for (let i = 1; i < valueList.length; i++) {
    if (valueList[i] !== valueList[i - 1] + 1) {
      isStraight = false;
      break;
    }
  }

  const counts = Object.values(valueCounts);
  const hasCount = (n) => counts.includes(n);
  const pairCount = counts.filter((c) => c === 2).length;

  if (isFlush && isStraight) return 8;
  if (hasCount(4)) return 7;
  if (hasCount(3) && hasCount(2)) return 6;
  if (isFlush) return 5;
  if (isStraight) return 4;
  if (hasCount(3)) return 3;
  if (pairCount === 2) return 2;
  if (pairCount === 1) return 1;
  return 0;
}

// カードの配列から役名(日本語)を返す。カードが無い場合は「カードなし」を返す
export function getHandName(cards) {
  if (!cards || cards.length === 0) return 'カードなし';
  return HAND_NAMES[evaluateHandRank(cards)];
}
