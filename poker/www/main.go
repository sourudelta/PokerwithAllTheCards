package main

import (
	"net/http"
	"www/internal/handlers"
)

func main() {
	// 静的ファイルサーバーの設定
	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)
	http.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir("./public/images"))))

	// ハンドラを登録
	http.HandleFunc("/ws", handlers.HandleConnections)
	// サーバの開始
	http.ListenAndServe("localhost:8080", nil) // 変更後

}
