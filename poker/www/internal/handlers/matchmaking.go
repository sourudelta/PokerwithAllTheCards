package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"sync"
	"time"
	"www/internal/models"
)

// ランダムマッチングの実装。
// WebSocketの受信処理(HandleConnections)は待機キューへの登録・取消だけを行い、
// マッチング成立の判定は一定間隔で動くマッチメイカー(StartMatchmaker)が担当する。

// 待機キューの1エントリ
type queueEntry struct {
	player   *Player
	joinedAt time.Time
}

// 先着順の待機キュー。成立判定(dequeuePair)と取消(cancel)を同じロックで直列化するため、
// 「取消済みのプレイヤーがマッチングされる」「マッチング済みのプレイヤーへ取消応答を送る」ことが起きない。
type matchQueue struct {
	mu      sync.Mutex
	entries []*queueEntry
}

var waitingQueue = &matchQueue{}

// キューへ登録する。すでに登録済みならfalse(二重登録防止)
func (q *matchQueue) enqueue(p *Player) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	for _, e := range q.entries {
		if e.player == p {
			return false
		}
	}
	q.entries = append(q.entries, &queueEntry{player: p, joinedAt: time.Now()})
	return true
}

// キューから取り除く。取り除けた(=まだマッチングされていなかった)場合のみtrue。
// 対象がいなくても安全に呼べるので、切断時にもそのまま使う。
func (q *matchQueue) cancel(p *Player) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i, e := range q.entries {
		if e.player == p {
			q.entries = append(q.entries[:i], q.entries[i+1:]...)
			return true
		}
	}
	return false
}

// キューの先頭に戻す(相手が直前に切断していた場合に、生きている側の順番を守るため)
func (q *matchQueue) pushFront(p *Player) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.entries = append([]*queueEntry{{player: p, joinedAt: time.Now()}}, q.entries...)
}

// 先着順に2名を取り出す。勝敗判定がプレイヤー名で行われるため、同名同士は組ませない。
// 先頭の人と組めるのは「先頭と違う名前の人のうち最も早く来た人」なので、1回の走査(O(n))で決まる。
// 先頭と違う名前が誰もいなければ、キュー全員が同名で誰も組めない。
// (同名を大量登録されても総当たりにならず、ロックを長時間握らない)
func (q *matchQueue) dequeuePair() (*Player, *Player, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()

	// 切断済みの接続を取り除く
	alive := q.entries[:0]
	for _, e := range q.entries {
		if !e.player.client.isClosed() {
			alive = append(alive, e)
		}
	}
	for i := len(alive); i < len(q.entries); i++ {
		q.entries[i] = nil
	}
	q.entries = alive

	if len(q.entries) < 2 {
		return nil, nil, false
	}
	first := q.entries[0].player
	for j := 1; j < len(q.entries); j++ {
		if q.entries[j].player.Name != first.Name {
			p2 := q.entries[j].player
			q.entries = append(q.entries[:j], q.entries[j+1:]...)
			q.entries = q.entries[1:]
			return first, p2, true
		}
	}
	return nil, nil, false
}

// マッチメイカーをバックグラウンドで起動する。ctxがキャンセルされると停止する。
func StartMatchmaker(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runMatchmakingTick()
			}
		}
	}()
}

// 1tick分のマッチングを行う。panicしてもマッチメイカー(=サーバー全体)を落とさない
func runMatchmakingTick() {
	defer func() {
		if r := recover(); r != nil {
			log.Println("matchmaker panic recovered:", r)
		}
	}()
	// 1tickで組めるだけ組む
	for tryMakeMatch() {
	}
}

// 1組のマッチングを試みる。成立したら(または次の組を試すべきなら)true
func tryMakeMatch() bool {
	p1, p2, ok := waitingQueue.dequeuePair()
	if !ok {
		return false
	}

	// 取り出した直後に切断されていた場合は成立させず、生きている側をキューの先頭に戻す
	if p1.client.isClosed() || p2.client.isClosed() {
		for _, p := range []*Player{p1, p2} {
			if !p.client.isClosed() {
				waitingQueue.pushFront(p)
			}
		}
		return true
	}

	// 確定フェーズ: ルームを採番・登録し、プレイヤーと紐づける
	room := createMatchedRoom(p1, p2)
	p1.room.Store(room)
	p2.room.Store(room)
	log.Printf("Match made: room %s (%q vs %q)", room.ID, p1.Name, p2.Name)

	// 通知フェーズ: send()はキューに積むだけでブロックしない。
	// この後で切断された場合は、切断側の受信ループ終了時に残った側へopponent_leftが通知される
	for _, p := range room.Players {
		opponent := room.getOpponent(p)
		p.client.send(map[string]interface{}{
			"type":     "match_found",
			"room_id":  room.ID,
			"opponent": opponent.Name,
		})
	}

	// ゲーム開始
	room.Round = 1
	room.Deck = models.ShuffleDeck(models.CreateDeck())
	room.distributeCards()

	// ルームを紐づける前に切断されていた場合、切断側の受信ループはルームを見つけられず後始末できないので、ここで行う
	// (removePlayerは何度呼んでも安全。通知が重複してもクライアント側で1回だけ処理する)
	for _, p := range []*Player{p1, p2} {
		if p.client.isClosed() {
			for _, other := range room.removePlayer(p) {
				other.client.send(map[string]interface{}{"type": "opponent_left"})
			}
		}
	}
	releaseMatchedRoomIfEmpty(room)
	return true
}

// ルームIDのタイムゾーン(サーバーの所在地に関係なく日本時間で採番する)
var roomIDLocation = time.FixedZone("JST", 9*60*60)

// ルームIDを生成する。形式: "r" + 日時(yyyyMMddHHmmss, JST) + ランダム8桁の16進数
// 例: r20261114153012a1b2c3d4
func generateRoomID(now time.Time) string {
	b := make([]byte, 4)
	// crypto/randは実質失敗しない。万一重複してもcreateMatchedRoomの存在チェックで再採番される
	_, _ = rand.Read(b)
	return "r" + now.In(roomIDLocation).Format("20060102150405") + hex.EncodeToString(b)
}

// 一意なIDでマッチング用ルームを作成して登録する。
// 採番と存在チェックをroomsMutexの中で行うので、既存ルームとIDが重複することはない。
func createMatchedRoom(p1, p2 *Player) *Room {
	roomsMutex.Lock()
	defer roomsMutex.Unlock()

	for {
		id := generateRoomID(time.Now())
		if _, exists := rooms[id]; exists {
			continue
		}
		room := &Room{ID: id, Players: []*Player{p1, p2}, Matched: true}
		rooms[id] = room
		return room
	}
}

// マッチング用ルームが空になったら登録を解除する。
// (マッチング用ルームにはID指定で参加できないので、空になった後に誰かが入ってくることはない)
func releaseMatchedRoomIfEmpty(room *Room) {
	if !room.Matched {
		return
	}
	roomsMutex.Lock()
	defer roomsMutex.Unlock()
	room.Mutex.Lock()
	defer room.Mutex.Unlock()

	if len(room.Players) == 0 {
		delete(rooms, room.ID)
		log.Printf("Room %s released", room.ID)
	}
}
