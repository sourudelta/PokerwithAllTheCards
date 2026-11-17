package models

import (
	"strings"
	"testing"
)

func c(suit string, v int) Card { return Card{Suit: suit, Value: v} }

func rc(effect string) Card {
	return Card{Suit: "Special", Value: 103, IsSpecial: true, Effect: effect}
}

func TestRuleCards(t *testing.T) {
	tests := []struct {
		name       string
		rule       string
		p1, p2     []Card
		wantWinner string
	}{
		{"場の和(多)", RuleFieldSumHigh, []Card{rc(RuleFieldSumHigh), c("Hearts", 2), c("Clubs", 3)}, []Card{c("Hearts", 13), c("Spades", 5)}, "B"},
		{"場の和(少)", RuleFieldSumLow, []Card{rc(RuleFieldSumLow), c("Hearts", 2), c("Clubs", 3)}, []Card{c("Hearts", 13), c("Spades", 5)}, "A"},
		{"エースは1", RuleFieldSumHigh, []Card{rc(RuleFieldSumHigh), c("Hearts", 14)}, []Card{c("Hearts", 2)}, "B"},
		{"スート種類", RuleSuitVariety, []Card{rc(RuleSuitVariety), c("Hearts", 2), c("Clubs", 3)}, []Card{c("Hearts", 13), c("Hearts", 5)}, "A"},
		{"絵札", RuleFaceCardCount, []Card{rc(RuleFaceCardCount), c("Hearts", 11)}, []Card{c("Hearts", 12), c("Hearts", 13)}, "B"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ResolveRule(tt.p1, tt.p2, nil).Rule; got != tt.rule {
				t.Fatalf("ResolveRule = %q, want %q", got, tt.rule)
			}
			res := CompareByRule(tt.rule, "A", tt.p1, "B", tt.p2)
			if !strings.HasPrefix(res, tt.wantWinner+" Wins") {
				t.Errorf("result = %q, want winner %s", res, tt.wantWinner)
			}
		})
	}
}

// 決まった出目を順番に返すサイコロ
func fixedDice(values ...int) func() int {
	i := 0
	return func() int {
		v := values[i]
		i++
		return v
	}
}

func TestResolveRule(t *testing.T) {
	high, low := []Card{rc(RuleFieldSumHigh)}, []Card{rc(RuleFieldSumLow)}

	// 競合: 出目が大きい方のルールを適用
	res := ResolveRule(high, low, fixedDice(2, 5))
	if res.Rule != RuleFieldSumLow || res.Owner != 2 || !res.Rolled || res.Dice1 != 2 || res.Dice2 != 5 {
		t.Errorf("clash p2 wins dice: got %+v", res)
	}
	// 同じ目は振り直し
	res = ResolveRule(high, low, fixedDice(3, 3, 6, 1))
	if res.Rule != RuleFieldSumHigh || res.Owner != 1 || res.Dice1 != 6 || res.Dice2 != 1 {
		t.Errorf("reroll on tie: got %+v", res)
	}
	// 両者同じルールならサイコロ不要
	res = ResolveRule(high, high, fixedDice())
	if res.Rule != RuleFieldSumHigh || res.Rolled {
		t.Errorf("same rule: got %+v", res)
	}
	// 自分が複数出した場合は一番左のカード
	res = ResolveRule([]Card{c("Hearts", 2), rc(RuleSuitVariety), rc(RuleFaceCardCount)}, nil, fixedDice())
	if res.Rule != RuleSuitVariety || res.Owner != 1 || res.Rolled {
		t.Errorf("leftmost card: got %+v", res)
	}
	// 無効化されたルールカードは無視し、次に左のカードを採用
	disabled := rc(RuleFieldSumHigh)
	disabled.IsSpecial = false // cancel_opponent_specialで無効化された状態
	res = ResolveRule(nil, []Card{disabled, rc(RuleFaceCardCount)}, fixedDice())
	if res.Rule != RuleFaceCardCount || res.Owner != 2 {
		t.Errorf("disabled card skipped: got %+v", res)
	}
	// ルールカードなし
	if res = ResolveRule(nil, nil, fixedDice()); res.Rule != "" {
		t.Errorf("no rule: got %+v", res)
	}
	// 実際の乱数でも1〜6の異なる目になる
	for i := 0; i < 100; i++ {
		res = ResolveRule(high, low, nil)
		if res.Dice1 == res.Dice2 || res.Dice1 < 1 || res.Dice1 > 6 || res.Dice2 < 1 || res.Dice2 > 6 {
			t.Fatalf("invalid dice: %+v", res)
		}
	}
}
