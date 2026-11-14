package handlers

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"www/internal/models"

	"github.com/gorilla/websocket"
)

type Room struct {
	ID              string
	Players         []*Player
	Mutex           sync.Mutex
	Round           int           // 現在のラウンド
	Deck            []models.Card // 両プレイヤーで共有する山札
	DestroyedPlayer *Player       // 直前のラウンドでdestroy_opponent_cardsにより手札を破壊されたプレイヤー(通知用、broadcastSelections内で消費してnilに戻す)
	Matched         bool          // ランダムマッチングで作成されたルームか(ID指定での参加不可)
}

type Player struct {
	Conn           *websocket.Conn // 受信専用。送信は必ずclient.send()を使う(同時書き込み防止)
	client         *wsClient
	Cards          []models.Card
	Ready          bool
	Selected       []models.Card
	RemainingCards []models.Card // 次のラウンド用のカード
	Name           string        // プレイヤー名
	Score          int           // ラウンド勝利数を管理
	Handlimit      int
	room           atomic.Pointer[Room] // 所属ルーム(マッチメイカーのgoroutineから設定されるためatomicで保持)
}

var (
	rooms      = make(map[string]*Room) // ルームIDとルームのマッピング
	roomsMutex sync.Mutex               // ルーム操作用ミューテックス
)

var upgrader = websocket.Upgrader{
	CheckOrigin: checkOrigin,
}

func sendError(c *wsClient, message string) {
	c.send(map[string]interface{}{"type": "error", "message": message})
}

// WebSocket接続を処理
func HandleConnections(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !ipLimits.acquireConn(ip) {
		log.Printf("Too many connections from %s", ip)
		http.Error(w, "too many connections", http.StatusTooManyRequests)
		return
	}
	defer ipLimits.releaseConn(ip)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading connection:", err)
		return
	}
	configureReader(conn)
	client := newWSClient(conn)
	defer client.close()
	limiter := newRateLimiter()

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
		if !limiter.allow() {
			log.Printf("Message rate exceeded from %s, closing", ip)
			break
		}

		// ランダムマッチングで成立したルームはマッチメイカー側で紐づけられるので、ここで拾う
		if room == nil && player != nil {
			room = player.room.Load()
		}

		switch msg.Type {
		case "queue.join":
			// ランダムマッチングの待機キューへ登録(成立判定はマッチメイカーが行う)
			if player != nil {
				log.Println("queue.join ignored: player already joined or queued")
				break
			}
			name, ok := validateName(msg.Name)
			if !ok {
				sendError(client, fmt.Sprintf("プレイヤー名は%d文字以内で入力してください。", maxNameLength))
				break
			}
			if !ipLimits.allowQueueJoin(ip) {
				sendError(client, "マッチングの試行回数が多すぎます。しばらく待ってからお試しください。")
				break
			}
			player = &Player{Conn: conn, client: client, Ready: false, Name: name, Handlimit: 7}
			client.send(map[string]interface{}{"type": "queue.joined"})
			waitingQueue.enqueue(player)
			log.Printf("Player %q entered matchmaking queue", name)

		case "queue.leave":
			// まだマッチングされていなければキューから外す。成立済みなら何もしない(そのままゲーム開始)
			if player != nil && room == nil && waitingQueue.cancel(player) {
				log.Printf("Player %q left matchmaking queue", player.Name)
				player = nil
				client.send(map[string]interface{}{"type": "queue.left"})
			}

		case "join":
			if player != nil {
				log.Println("join ignored: player already joined or queued")
				break
			}
			name, ok := validateName(msg.Name)
			if !ok {
				sendError(client, fmt.Sprintf("プレイヤー名は%d文字以内で入力してください。", maxNameLength))
				break
			}
			if !validateRoomID(msg.RoomID) {
				sendError(client, fmt.Sprintf("ルームIDは%d文字以内で入力してください。", maxRoomIDLength))
				break
			}
			// ルーム取得または作成
			room = getOrCreateRoom(msg.RoomID)
			if room.Matched {
				// ランダムマッチング用のルームにはID指定で参加させない
				sendError(client, "このルームIDは使用できません。")
				room = nil
				break
			}
			// プレイヤー作成
			p := &Player{Conn: conn, client: client, Ready: false, Name: name, Handlimit: 7}
			// プレイヤー追加が成功したか確認
			if !room.addPlayer(p) {
				room = nil
				break // ルームが満員なら処理を中断
			}
			player = p
			player.room.Store(room)
			log.Printf("Player %q joined room %q", name, msg.RoomID)

			// 必要ならクライアントに確認メッセージを送信
			client.send(map[string]interface{}{
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
						p.client.send(map[string]interface{}{
							"type":    "restart",
							"message": "Game has been restarted.",
						})
					}
				}
			}
		}

	}

	if player != nil {
		// 待機中に切断された場合はキューから外す(対象がいなければ何もしない)
		waitingQueue.cancel(player)
		if room == nil {
			room = player.room.Load()
		}
	}

	for room != nil && player != nil {
		// プレイヤーのメッセージを処理
		if !room.handlePlayerMessages(player) {
			break
		}
	}

	// 切断時にルームからプレイヤーを削除し、残ったプレイヤーへ通知する
	if room != nil && player != nil {
		remaining := room.removePlayer(player)
		log.Printf("Player disconnected from room %s", room.ID)
		for _, p := range remaining {
			p.client.send(map[string]interface{}{"type": "opponent_left"})
		}
		releaseMatchedRoomIfEmpty(room)
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
		player.client.send(map[string]interface{}{
			"type":    "error",
			"message": "ルームはすでに満員です。",
		})
		return false
	}

	// 同名のプレイヤーがいないかチェック
	for _, p := range r.Players {
		if p.Name == player.Name {
			log.Printf("Player name %s already exists in room %s.", player.Name, r.ID)
			player.client.send(map[string]interface{}{
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

// ルームからプレイヤーを削除し、残ったプレイヤーの一覧を返す
func (r *Room) removePlayer(player *Player) []*Player {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	for i, p := range r.Players {
		if p == player {
			r.Players = append(r.Players[:i], r.Players[i+1:]...)
			break
		}
	}
	return append([]*Player{}, r.Players...)
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
		p.client.send(map[string]interface{}{
			"type":  "cards",
			"cards": p.Cards,
		})
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
		if r.DestroyedPlayer != nil && r.DestroyedPlayer == opponent {
			data["effect"] = "destroy_opponent_cards"
		}
		p.client.send(data)
	}
	r.DestroyedPlayer = nil
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

		// 勝敗判定だけに使う「効果適用後」の手札。player.Selectedは公開(リビール)用に
		// 本来選んだカードのまま残しておき、破壊演出をクライアント側で見せてから消える形にする。
		effectiveP1Cards, effectiveP2Cards, destroyedPlayer := applySpecialEffects(player1, player2, player1.Selected, player2.Selected, player1.Name, player2.Name)
		r.DestroyedPlayer = destroyedPlayer

		// 選択したカードの比較処理
		result := models.CompareHands(player1.Name, effectiveP1Cards, player2.Name, effectiveP2Cards)

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
			p.client.send(map[string]interface{}{
				"type":   "result",
				"result": result,
				"round":  r.Round,
			})
		}
	}
}

// 特殊カードの効果を適用する関数。戻り値は勝敗判定専用の手札で、player.Selected自体は書き換えない
// (リビール表示は本来選んだカードのまま行い、破壊されたことはdestroyedPlayerの戻り値で別途通知する)。
func applySpecialEffects(Player1, Player2 *Player, player1Cards, player2Cards []models.Card, player1Name, player2Name string) ([]models.Card, []models.Card, *Player) {
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
			return player1Cards, []models.Card{}, Player2 // 勝敗判定上は相手の手札を空扱いにする
		}
	}
	for _, card := range player2Cards {
		if card.IsSpecial && card.Effect == "destroy_opponent_cards" {
			log.Printf("%s activated destroy_opponent_cards! Opponent's cards are destroyed.", player2Name)
			return []models.Card{}, player2Cards, Player1 // 勝敗判定上は相手の手札を空扱いにする
		}
	}

	// 特殊効果を適用した後のカードを返す(発動なし)
	return player1Cards, player2Cards, nil
}

// プレイヤー状態をリセット
func (r *Room) resetPlayerStates() {
	for _, p := range r.Players {
		p.Ready = false
		p.Selected = nil
	}
}
