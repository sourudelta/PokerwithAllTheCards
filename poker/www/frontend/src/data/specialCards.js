// カードのValueをキーにした特殊カードの効果説明
export const SPECIAL_CARDS = {
  100: { effect: '相手のカードを全て破壊' },
  101: { effect: '相手の特殊カードを無効にする' },
  102: { effect: '相手の手札上限を１減らす' },
  103: { effect: '場の数字の和が多い方の勝ち' },
  104: { effect: '場の数字の和が少ない方の勝ち' },
  105: { effect: '場のスートの種類が多い方の勝ち' },
  106: { effect: '場の絵札(J,Q,K)が多い方の勝ち' },
};

// ルール変更カードの効果名(サーバーのresultメッセージのrule)をキーにした、比較値の表示名
export const RULE_VALUE_LABELS = {
  rule_field_sum_high: '場の合計',
  rule_field_sum_low: '場の合計',
  rule_suit_variety: 'スートの種類',
  rule_face_card_count: '絵札の枚数',
};
