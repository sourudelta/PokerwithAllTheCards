package handlers

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"www/internal/models"

	"github.com/gorilla/websocket"
)

type Room struct {
	ID      string
	Players []*Player
	Mutex   sync.Mutex
	Round   int           // 現在のラウンド
	Deck    []models.Card // 両プレイヤーで共有する山札
}

type Player struct {
	Conn           *websocket.Conn
	Cards          []models.Card
	Ready          bool
	Selected       []models.Card
	RemainingCards []models.Card // 次のラウンド用のカード
	Name           string        // プレイヤー名
	Score          int           // ラウンド勝利数を管理
	Handlimit      int
}

var (
	rooms      = make(map[string]*Room) // ルームIDとルームのマッピング
	roomsMutex sync.Mutex               // ルーム操作用ミューテックス
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WebSocket接続を処理
func HandleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading connection:", err)
		return
	}
	defer conn.Close()

	var player *Player
	var room *Room

	for {
		var msg struct {
			Type     string        `json:"type"`
			RoomID   string        `json:"room_id,omitempty"`
			Name     string        `json:"name,omitempty"`
			Selected []models.Card `json:"selected,omitempty"`
		}

		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println("Error reading JSON:", err)
			break
		}

		switch msg.Type {
		case "join":
			// プレイヤー作成
			player = &Player{Conn: conn, Ready: false, Name: msg.Name}
			player.Handlimit = 7
			// ルーム取得または作成
			room = getOrCreateRoom(msg.RoomID)
			// プレイヤー追加が成功したか確認
			if !room.addPlayer(player) {
				break // ルームが満員なら処理を中断
			}
			log.Printf("Player %s joined room %s", msg.Name, msg.RoomID)

			// 必要ならクライアントに確認メッセージを送信
			conn.WriteJSON(map[string]interface{}{
				"type":    "joined",
				"room_id": msg.RoomID,
				"message": "Successfully joined room",
			})

			// プレイヤーが揃ったらゲーム開始
			if len(room.Players) == 2 {
				room.Round = 1
				room.Deck = models.ShuffleDeck(models.CreateDeck()) // 両者共有の山札を新しく用意
				log.Println(room.Round)
				room.distributeCards()
			}

		case "ready":
			// プレイヤー準備状態の更新
			if room != nil {
				room.handleReadyState(player, msg.Selected)
			}

		case "restart":
			if room != nil {
				player.Ready = true

				if room.allPlayersReady() {
					room.resetPlayerStates() // プレイヤー状態のリセット
					room.distributeCards()   // 新しいカードを配布
					// クライアントにリスタートを通知
					for _, p := range room.Players {
						err := p.Conn.WriteJSON(map[string]interface{}{
							"type":    "restart",
							"message": "Game has been restarted.",
						})
						if err != nil {
							log.Println("Error sending restart notification:", err)
						}
					}
				}
			}
		}

	}

	for {
		// プレイヤーのメッセージを処理
		if !room.handlePlayerMessages(player) {
			break
		}
	}

	// 切断時にルームからプレイヤーを削除
	if room != nil && player != nil {
		room.removePlayer(player)
		log.Printf("Player disconnected from room %s", room.ID)
	}
}

// ルームを取得または作成
func getOrCreateRoom(roomID string) *Room {
	roomsMutex.Lock()
	defer roomsMutex.Unlock()

	room, exists := rooms[roomID]
	if !exists {
		room = &Room{ID: roomID, Players: []*Player{}}
		rooms[roomID] = room
	}
	return room
}

// ルームにプレイヤーを追加
func (r *Room) addPlayer(player *Player) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	if len(r.Players) >= 2 {
		log.Printf("Room %s is full. Player %s cannot join.", r.ID, player.Name)
		_ = player.Conn.WriteJSON(map[string]interface{}{
			"type":    "error",
			"message": "ルームはすでに満員です。",
		})
		return false
	}

	// 同名のプレイヤーがいないかチェック
	for _, p := range r.Players {
		if p.Name == player.Name {
			log.Printf("Player name %s already exists in room %s.", player.Name, r.ID)
			_ = player.Conn.WriteJSON(map[string]interface{}{
				"type":    "error",
				"message": "すでに同じ名前のプレイヤーが存在します。",
			})
			return false
		}
	}

	r.Players = append(r.Players, player)
	log.Printf("Player %s added to room %s. Total players: %d", player.Name, r.ID, len(r.Players))
	return true
}

// ルームからプレイヤーを削除
func (r *Room) removePlayer(player *Player) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	for i, p := range r.Players {
		if p == player {
			r.Players = append(r.Players[:i], r.Players[i+1:]...)
			break
		}
	}
}

// カードを一意に識別するためのキー
func cardKey(c models.Card) string {
	return fmt.Sprintf("%s-%d", c.Suit, c.Value)
}

// 選択(提出)されなかったカードを求める
func subtractCards(cards, selected []models.Card) []models.Card {
	selectedKeys := make(map[string]int)
	for _, c := range selected {
		selectedKeys[cardKey(c)]++
	}

	var remaining []models.Card
	for _, c := range cards {
		key := cardKey(c)
		if selectedKeys[key] > 0 {
			selectedKeys[key]--
			continue
		}
		remaining = append(remaining, c)
	}
	return remaining
}

// 共有デッキからまだ配られていないカードをn枚引く。
// デッキ側は消費済みとしてHandedを立てるが、そのプレイヤーにとっては初めて手元に来るカードなので、
// 返す値はHanded=falseのままにして配布アニメーションの対象にする。
func (r *Room) drawCards(n int) []models.Card {
	var drawn []models.Card
	for i := range r.Deck {
		if len(drawn) >= n {
			break
		}
		if !r.Deck[i].Handed {
			r.Deck[i].Handed = true
			card := r.Deck[i]
			card.Handed = false
			drawn = append(drawn, card)
		}
	}
	return drawn
}

// プレイヤーにカードを配布(出さなかったカードはそのまま保持し、不足分のみ共有デッキから新しく配る)
func (r *Room) distributeCards() {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	for _, p := range r.Players {
		needed := p.Handlimit - len(p.RemainingCards)
		if needed < 0 {
			needed = 0
		}

		newCards := r.drawCards(needed)
		if len(newCards) < needed {
			log.Println("Not enough cards left in the deck to distribute.")
			return
		}

		p.Cards = append(append([]models.Card{}, p.RemainingCards...), newCards...)
		p.RemainingCards = nil

		// クライアントにカードを送信
		err := p.Conn.WriteJSON(map[string]interface{}{
			"type":  "cards",
			"cards": p.Cards,
		})
		if err != nil {
			log.Println("Error sending cards:", err)
		}
	}
}

// プレイヤーメッセージを処理
func (r *Room) handlePlayerMessages(player *Player) bool {
	var msg struct {
		Type     string        `json:"type"`
		Selected []models.Card `json:"selected,omitempty"`
	}
	err := player.Conn.ReadJSON(&msg)
	if err != nil {
		log.Println("Error reading JSON:", err)
		return false
	}

	switch msg.Type {
	case "ready":
		r.handleReadyState(player, msg.Selected)
	}
	return true
}

// プレイヤーが準備完了した際の処理
func (r *Room) handleReadyState(player *Player, selected []models.Card) {
	player.Ready = true
	player.Selected = selected
	player.RemainingCards = subtractCards(player.Cards, selected) // 出さなかったカードを次ラウンド用に保持
	for i := range player.RemainingCards {
		player.RemainingCards[i].Handed = true // 既にクライアントへ見せたことがあるカードなので次回はアニメーションさせない
	}

	if r.allPlayersReady() {

		r.handleGameLogic()
		r.broadcastSelections()
		r.resetPlayerStates()
	}
}

// 全プレイヤーが準備完了しているか確認
func (r *Room) allPlayersReady() bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	if len(r.Players) != 2 {
		return false
	}
	for _, p := range r.Players {
		if !p.Ready {
			return false
		}
	}
	return true
}

// プレイヤー選択をブロードキャスト
func (r *Room) broadcastSelections() {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	for _, p := range r.Players {
		opponent := r.getOpponent(p)
		data := map[string]interface{}{
			"type":     "update",
			"opponent": opponent.Selected, // 相手の選択カードを送信
		}
		p.Conn.WriteJSON(data)
	}
}

// 相手プレイヤーを取得
func (r *Room) getOpponent(player *Player) *Player {
	if len(r.Players) == 2 {
		if player == r.Players[0] {
			return r.Players[1]
		}
		return r.Players[0]
	}
	return nil
}

// ゲームロジックの実行
func (r *Room) handleGameLogic() {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	if len(r.Players) == 2 && r.Players[0].Ready && r.Players[1].Ready {
		player1 := r.Players[0]
		player2 := r.Players[1]

		player1.Selected, player2.Selected = applySpecialEffects(player1, player2, player1.Selected, player2.Selected, player1.Name, player2.Name)
		// 選択したカードの比較処理
		result := models.CompareHands(player1.Name, player1.Selected, player2.Name, player2.Selected)

		if result == player1.Name {
			player1.Score++
		} else if result == player2.Name {
			player2.Score++
		}

		r.Round++
		if r.Round > 5 {
			log.Println("finish")
		}

		// 結果をクライアントに送信
		for _, p := range r.Players {
			err := p.Conn.WriteJSON(map[string]interface{}{
				"type":   "result",
				"result": result,
				"round":  r.Round,
			})
			if err != nil {
				log.Println("Error sending result:", err)
			}
		}
	}
}

// 特殊カードの効果を適用する関数
func applySpecialEffects(Player1, Player2 *Player, player1Cards, player2Cards []models.Card, player1Name, player2Name string) ([]models.Card, []models.Card) {
	// ステップ1: 無効化処理（cancel_opponent_special）
	for _, card := range player1Cards {
		if card.IsSpecial && card.Effect == "cancel_opponent_special" {
			log.Printf("%s activated cancel_opponent_special! Opponent's special effects are disabled.", player1Name)
			for i := range player2Cards {
				if player2Cards[i].IsSpecial {
					player2Cards[i].IsSpecial = false
					player2Cards[i].Effect = ""
				}
			}
		}
	}
	for _, card := range player2Cards {
		if card.IsSpecial && card.Effect == "cancel_opponent_special" {
			log.Printf("%s activated cancel_opponent_special! Opponent's special effects are disabled.", player2Name)
			for i := range player1Cards {
				if player1Cards[i].IsSpecial {
					player1Cards[i].IsSpecial = false
					player1Cards[i].Effect = ""
				}
			}
		}
	}

	// ステップ3: 手札上限の減少処理（forceful_sentry）
	for _, card := range player1Cards {
		if card.IsSpecial && card.Effect == "forceful_sentry" {
			log.Printf("%s activated forceful_sentry! Reduced the opponent's hand limit.", player1Name)
			if Player2.Handlimit > 5 {
				Player2.Handlimit--
			}
		}
	}
	for _, card := range player2Cards {
		if card.IsSpecial && card.Effect == "forceful_sentry" {
			log.Printf("%s activated forceful_sentry! Reduced the opponent's hand limit.", player2Name)
			if Player1.Handlimit > 5 {
				Player1.Handlimit--
			}
		}
	}

	// ステップ2: 破壊処理（destroy_opponent_cards）
	for _, card := range player1Cards {
		if card.IsSpecial && card.Effect == "destroy_opponent_cards" {
			log.Printf("%s activated destroy_opponent_cards! Opponent's cards are destroyed.", player1Name)
			return player1Cards, []models.Card{} // 相手のカードを全て破壊
		}
	}
	for _, card := range player2Cards {
		if card.IsSpecial && card.Effect == "destroy_opponent_cards" {
			log.Printf("%s activated destroy_opponent_cards! Opponent's cards are destroyed.", player2Name)
			return []models.Card{}, player2Cards // 相手のカードを全て破壊
		}
	}

	// 特殊効果を適用した後のカードを返す
	return player1Cards, player2Cards
}

// プレイヤー状態をリセット
func (r *Room) resetPlayerStates() {
	for _, p := range r.Players {
		p.Ready = false
		p.Selected = nil
	}
}
