package models

import (
	"fmt"
	"math/rand"
	"sort"
	"time"
)

type Card struct {
	Suit      string // スート (例: "Hearts", "Clubs")
	Value     int    // 値 (例: 1〜13)
	Image     string `json:"image"` // カード画像のファイルパス
	IsSpecial bool   // 特殊カードかどうか
	Effect    string // 特殊カードの効果名
}

// デッキを生成する関数
func CreateDeck() []Card {
	suits := []string{"Hearts", "Diamonds", "Clubs", "Spades"}
	var deck []Card

	for _, suit := range suits {
		for value := 2; value <= 13; value++ {
			deck = append(deck, Card{
				Suit:  suit,
				Value: value,
				Image: fmt.Sprintf("images/%d.%s.png", value, suit), // 例: "images/1.Spades.png"
			})
		}
	}

	for _, suit := range suits {
		deck = append(deck, Card{
			Suit:  suit,
			Value: 14,
			Image: fmt.Sprintf("images/%d.%s.png", 1, suit), // 例: "images/1.Spades.png"
		})
	}
	// 特殊カードの追加
	deck = append(deck, Card{
		Suit:      "Special",
		Value:     100,                  // 値を特殊カード用に0などの特別な値に設定
		Image:     "images/thunder.png", // 特殊カードの画像
		IsSpecial: true,
		Effect:    "destroy_opponent_cards",
	})
	deck = append(deck, Card{
		Suit:      "Special",
		Value:     101,                // 値を特殊カード用に0などの特別な値に設定
		Image:     "images/mugen.png", // 特殊カードの画像
		IsSpecial: true,
		Effect:    "cancel_opponent_special",
	})

	deck = append(deck, Card{
		Suit:      "Special",
		Value:     102,                         // 値を特殊カード用に0などの特別な値に設定
		Image:     "images/ForcefulSentry.png", // 特殊カードの画像
		IsSpecial: true,
		Effect:    "forceful_sentry",
	})
	return deck
}

// デッキをシャッフルする関数
func ShuffleDeck(deck []Card) []Card {
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
	return deck
}

type HandRank int

const (
	HighCard HandRank = iota
	OnePair
	TwoPair
	ThreeOfAKind
	Straight
	Flush
	FullHouse
	FourOfAKind
	StraightFlush
)

func EvaluateHand(cards []Card) (HandRank, []int) {
	suits := map[string]int{}
	values := map[int]int{}
	valueList := []int{}

	for _, card := range cards {
		suits[card.Suit]++
		values[card.Value]++
		valueList = append(valueList, card.Value)
	}

	sort.Ints(valueList)
	isFlush := len(suits) == 1
	isStraight := true
	for i := 1; i < len(valueList); i++ {
		if valueList[i] != valueList[i-1]+1 {
			isStraight = false
			break
		}
	}

	switch {
	case isFlush && isStraight:
		return StraightFlush, valueList
	case hasCount(values, 4):
		return FourOfAKind, valueList
	case hasCount(values, 3) && hasCount(values, 2):
		return FullHouse, valueList
	case isFlush:
		return Flush, valueList
	case isStraight:
		return Straight, valueList
	case hasCount(values, 3):
		return ThreeOfAKind, valueList
	case countPairs(values) == 2:
		return TwoPair, valueList
	case countPairs(values) == 1:
		return OnePair, valueList
	default:
		return HighCard, valueList
	}
}

func hasCount(values map[int]int, count int) bool {
	for _, v := range values {
		if v == count {
			return true
		}
	}
	return false
}

func countPairs(values map[int]int) int {
	pairs := 0
	for _, v := range values {
		if v == 2 {
			pairs++
		}
	}
	return pairs
}

func CompareHands(player1Name string, player1Selected []Card, player2Name string, player2Selected []Card) string {
	rank1, values1 := EvaluateHand(player1Selected)
	rank2, values2 := EvaluateHand(player2Selected)

	// どちらかのプレイヤーが手札を持っていない場合の処理
	if len(player1Selected) == 0 && len(player2Selected) > 0 {
		return fmt.Sprintf("%s Wins (opponent has no cards)", player2Name)
	}
	if len(player2Selected) == 0 && len(player1Selected) > 0 {
		return fmt.Sprintf("%s Wins (opponent has no cards)", player1Name)
	}
	if len(player1Selected) == 0 && len(player2Selected) == 0 {
		return "It's a Draw (both players have no cards)"
	}

	// ランクが異なる場合
	if rank1 > rank2 {
		return fmt.Sprintf("%s Wins", player1Name)
	} else if rank1 < rank2 {
		return fmt.Sprintf("%s Wins", player2Name)
	} else {
		// ランクが同じ場合、カードの値を比較
		// 並び順は昇順にすることで比較しやすくする
		sort.Sort(sort.Reverse(sort.IntSlice(values1)))
		sort.Sort(sort.Reverse(sort.IntSlice(values2)))

		// 最も強いカードから順番に比較
		for i := len(values1) - 1; i >= 0; i-- {
			if values1[i] > values2[i] {
				return fmt.Sprintf("%s Wins", player1Name)
			} else if values1[i] < values2[i] {
				return fmt.Sprintf("%s Wins", player2Name)
			}
		}

		return "It's a Draw"
	}
}
