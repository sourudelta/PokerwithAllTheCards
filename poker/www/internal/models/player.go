package models

type Player struct {
	ID     string `json:"id"`      // 一意のプレイヤーID
	Name   string `json:"name"`    // プレイヤーの名前
	RoomID string `json:"room_id"` // 所属するルームID
	Ready  bool   `json:"ready"`   // 準備状態
	Cards  []Card `json:"cards"`   // 配られたカード
}
