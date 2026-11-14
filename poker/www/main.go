package main

import (
	"context"
	"net/http"
	"os"
	"time"
	"www/internal/handlers"
)

func main() {
	// ランダムマッチングのマッチメイカーを起動(500msごとに待機キューを確認)
	handlers.StartMatchmaker(context.Background(), 500*time.Millisecond)

	// 静的ファイルサーバーの設定
	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)
	http.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir("./public/images"))))

	// ハンドラを登録
	http.HandleFunc("/ws", handlers.HandleConnections)

	// Railway用: PORT環境変数でリッスン
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.ListenAndServe(":"+port, nil)

}
