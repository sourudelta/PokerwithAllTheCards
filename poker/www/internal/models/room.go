package models

import "github.com/gorilla/websocket"

type Room struct {
	ID        string                      // ルームID
	Players   map[*websocket.Conn]*Player // ルーム内のプレイヤーリスト
	Broadcast chan interface{}            // メッセージを全プレイヤーに送るためのチャネル
}

// ルームの初期化
func NewRoom(id string) *Room {
	return &Room{
		ID:        id,
		Players:   make(map[*websocket.Conn]*Player),
		Broadcast: make(chan interface{}),
	}
}

// ルームへプレイヤーを追加
func (room *Room) AddPlayer(conn *websocket.Conn, player *Player) {
	room.Players[conn] = player
}

// ルームからプレイヤーを削除
func (room *Room) RemovePlayer(conn *websocket.Conn) {
	delete(room.Players, conn)
}
