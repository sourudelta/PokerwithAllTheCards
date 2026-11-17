package models

import "math/rand"

// 勝敗のルールそのものを変更する特殊カードの効果名
const (
	RuleFieldSumHigh  = "rule_field_sum_high"  // 出してる場の数字の和が多い方の勝ち
	RuleFieldSumLow   = "rule_field_sum_low"   // 出してる場の数字の和が少ない方の勝ち
	RuleSuitVariety   = "rule_suit_variety"    // 出してる場のスートの種類が多い方の勝ち
	RuleFaceCardCount = "rule_face_card_count" // 出してる場の絵札(J,Q,K)が多い方の勝ち
)

type ruleDef struct {
	description string
	higherWins  bool                   // trueなら値が大きい方、falseなら小さい方の勝ち
	score       func(cards []Card) int // 場のカードから比較に使う値を求める
}

var rules = map[string]ruleDef{
	RuleFieldSumHigh:  {"場の数字の和が多い方の勝ち", true, sumValues},
	RuleFieldSumLow:   {"場の数字の和が少ない方の勝ち", false, sumValues},
	RuleSuitVariety:   {"場のスートの種類が多い方の勝ち", true, countSuits},
	RuleFaceCardCount: {"場の絵札(J,Q,K)が多い方の勝ち", true, countFaceCards},
}

// IsRuleEffect は効果名がルール変更カードのものかを返す
func IsRuleEffect(effect string) bool {
	_, ok := rules[effect]
	return ok
}

// RuleDescription はルール変更カードの説明文を返す
func RuleDescription(effect string) string {
	return rules[effect].description
}

// isSpecialCard は特殊カード(無効化されたものも含む)かを判定する。
// cancel_opponent_specialで無効化されるとIsSpecialがfalseになるため、Suitで判定する。
func isSpecialCard(c Card) bool {
	return c.Suit == "Special"
}

// cardNumber は和の計算に使うカードの数字。特殊カードは0、エースは1として数える
func cardNumber(c Card) int {
	if isSpecialCard(c) {
		return 0
	}
	if c.Value == 14 {
		return 1
	}
	return c.Value
}

func sumValues(cards []Card) int {
	total := 0
	for _, c := range cards {
		total += cardNumber(c)
	}
	return total
}

func countSuits(cards []Card) int {
	suits := map[string]bool{}
	for _, c := range cards {
		if !isSpecialCard(c) {
			suits[c.Suit] = true
		}
	}
	return len(suits)
}

func countFaceCards(cards []Card) int {
	count := 0
	for _, c := range cards {
		if !isSpecialCard(c) && c.Value >= 11 && c.Value <= 13 {
			count++
		}
	}
	return count
}

// PlayerRule はプレイヤーの場(効果適用後)で有効なルール変更カードを返す。
// 複数出している場合は一番左(場の並びで先頭)のカードを採用する。無ければ""を返す。
func PlayerRule(cards []Card) string {
	for _, c := range cards {
		if c.IsSpecial && IsRuleEffect(c.Effect) {
			return c.Effect
		}
	}
	return ""
}

// RuleResolution は両者のルール変更カードの競合を解決した結果
type RuleResolution struct {
	Rule   string // 適用するルール(""なら通常のポーカー役で判定)
	Owner  int    // 適用したルールを出したプレイヤー(1 or 2、両者同じルールなら0)
	Rolled bool   // サイコロで決めたかどうか
	Dice1  int    // プレイヤー1の出目
	Dice2  int    // プレイヤー2の出目
}

// ResolveRule は両者の場から適用するルールを決める。
// 異なるルールがぶつかった場合はお互いにサイコロ(1〜6)を振り、出目が大きい方のルールを適用する(同じ目なら振り直し)。
// rollはテスト用に差し替えられるサイコロ関数で、nilなら乱数を使う。
func ResolveRule(p1Cards, p2Cards []Card, roll func() int) RuleResolution {
	if roll == nil {
		roll = func() int { return rand.Intn(6) + 1 }
	}
	r1, r2 := PlayerRule(p1Cards), PlayerRule(p2Cards)
	switch {
	case r1 == "" && r2 == "":
		return RuleResolution{}
	case r2 == "":
		return RuleResolution{Rule: r1, Owner: 1}
	case r1 == "":
		return RuleResolution{Rule: r2, Owner: 2}
	case r1 == r2:
		return RuleResolution{Rule: r1}
	}

	res := RuleResolution{Rolled: true}
	for res.Dice1 == res.Dice2 {
		res.Dice1, res.Dice2 = roll(), roll()
	}
	if res.Dice1 > res.Dice2 {
		res.Rule, res.Owner = r1, 1
	} else {
		res.Rule, res.Owner = r2, 2
	}
	return res
}

// RuleScores はルールに応じた各プレイヤーの比較値を返す
func RuleScores(rule string, p1Field, p2Field []Card) (int, int) {
	def := rules[rule]
	return def.score(p1Field), def.score(p2Field)
}

// CompareByRule はルール変更カードによる勝敗判定を行う。
// どちらかの場が空(破壊含む)の場合や比較値が同じ場合は通常のポーカー役で判定する。
func CompareByRule(rule string, p1Name string, p1Field []Card, p2Name string, p2Field []Card) string {
	if len(p1Field) == 0 || len(p2Field) == 0 {
		return CompareHands(p1Name, p1Field, p2Name, p2Field)
	}

	def := rules[rule]
	s1, s2 := RuleScores(rule, p1Field, p2Field)
	if s1 == s2 {
		return CompareHands(p1Name, p1Field, p2Name, p2Field)
	}
	if (s1 > s2) == def.higherWins {
		return p1Name + " Wins"
	}
	return p2Name + " Wins"
}
