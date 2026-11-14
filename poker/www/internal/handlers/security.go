package handlers

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

// ===== 接続まわりの制限値 =====
const (
	writeWait       = 10 * time.Second  // 1メッセージの送信にかけてよい最大時間(超えたら切断)
	pongWait        = 60 * time.Second  // この時間クライアントから何も届かなければ切断
	pingPeriod      = pongWait * 9 / 10 // pingの送信間隔(pongWaitより短くする)
	maxMessageSize  = 8 * 1024          // 受信する1メッセージの最大バイト数
	sendBufferSize  = 32                // 送信待ちメッセージの上限。溢れたら受信しないクライアントとみなし切断
	maxConnsPerIP   = 10                // 同一IPからの同時接続数の上限
	queueJoinWindow = time.Minute       // キュー登録回数を数える期間
	maxQueueJoins   = 20                // queueJoinWindow内に同一IPがキュー登録できる回数
	msgRatePerSec   = 10                // 1接続あたりの受信メッセージ数(毎秒の補充量)
	msgBurst        = 20                // 1接続あたりの受信メッセージ数(瞬間的な上限)
	maxNameLength   = 20                // プレイヤー名の最大文字数
	maxRoomIDLength = 32                // ID指定参加のルームIDの最大文字数
)

// ===== 送信の一本化 =====
// gorilla/websocketは1接続への同時書き込みに対応していない(panicする)ため、
// 書き込みはwritePumpのgoroutineだけが行い、他からはsend()でキューに積むだけにする。
// send()はブロックしないので、受信しないクライアントがいてもマッチメイカー等の呼び出し元は止まらない。
type wsClient struct {
	conn      *websocket.Conn
	sendCh    chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

func newWSClient(conn *websocket.Conn) *wsClient {
	c := &wsClient{
		conn:   conn,
		sendCh: make(chan []byte, sendBufferSize),
		done:   make(chan struct{}),
	}
	go c.writePump()
	return c
}

// メッセージを送信キューに積む。キューが溢れたら受信しないクライアントとみなして切断する。
// JSON化はこの時点で行う(送信までの間に呼び出し元が手札などのスライスを書き換えても影響しないように)
func (c *wsClient) send(v interface{}) {
	select {
	case <-c.done:
		return
	default:
	}
	data, err := json.Marshal(v)
	if err != nil {
		log.Println("Error encoding message:", err)
		return
	}
	select {
	case c.sendCh <- data:
	default:
		log.Println("send buffer full, closing slow client")
		c.close()
	}
}

func (c *wsClient) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.conn.Close() // 受信ループ側のReadJSONもエラーで抜ける
	})
}

func (c *wsClient) isClosed() bool {
	select {
	case <-c.done:
		return true
	default:
		return false
	}
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		if r := recover(); r != nil {
			log.Println("writePump panic recovered:", r)
		}
		c.close()
	}()

	for {
		select {
		case <-c.done:
			return
		case data := <-c.sendCh:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Println("Error writing message:", err)
				return
			}
		case <-ticker.C:
			// 半開き(実際には切れている)接続を検出するためのping。ブラウザは自動でpongを返す
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// 受信側の制限を設定する(サイズ上限・無通信タイムアウト)
func configureReader(conn *websocket.Conn) {
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
}

// ===== 1接続あたりの受信レート制限(トークンバケット) =====
type rateLimiter struct {
	tokens float64
	last   time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{tokens: msgBurst, last: time.Now()}
}

func (l *rateLimiter) allow() bool {
	now := time.Now()
	l.tokens += now.Sub(l.last).Seconds() * msgRatePerSec
	if l.tokens > msgBurst {
		l.tokens = msgBurst
	}
	l.last = now
	if l.tokens < 1 {
		return false
	}
	l.tokens--
	return true
}

// ===== IP単位の制限 =====
type ipLimiter struct {
	mu         sync.Mutex
	conns      map[string]int
	queueJoins map[string][]time.Time
}

var ipLimits = &ipLimiter{
	conns:      make(map[string]int),
	queueJoins: make(map[string][]time.Time),
}

// 同時接続数の枠を確保する。上限を超える場合はfalse
func (l *ipLimiter) acquireConn(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conns[ip] >= maxConnsPerIP {
		return false
	}
	l.conns[ip]++
	return true
}

func (l *ipLimiter) releaseConn(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.conns[ip]--
	if l.conns[ip] <= 0 {
		delete(l.conns, ip)
	}
}

// キュー登録の頻度を確認する。期間内の上限を超える場合はfalse
func (l *ipLimiter) allowQueueJoin(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := time.Now().Add(-queueJoinWindow)
	recent := l.queueJoins[ip][:0]
	for _, t := range l.queueJoins[ip] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= maxQueueJoins {
		l.queueJoins[ip] = recent
		return false
	}
	l.queueJoins[ip] = append(recent, time.Now())
	return true
}

// 古いキュー登録履歴を定期的に掃除する(放置するとIPの数だけmapが増え続けるため)
func startIPLimiterJanitor() {
	go func() {
		for range time.Tick(queueJoinWindow) {
			ipLimits.mu.Lock()
			cutoff := time.Now().Add(-queueJoinWindow)
			for ip, ts := range ipLimits.queueJoins {
				if len(ts) == 0 || ts[len(ts)-1].Before(cutoff) {
					delete(ipLimits.queueJoins, ip)
				}
			}
			ipLimits.mu.Unlock()
		}
	}()
}

func init() {
	startIPLimiterJanitor()
}

// クライアントのIPを求める。Railwayなどのリバースプロキシ経由ではRemoteAddrがプロキシになるため、
// プロキシが末尾に追記するX-Forwarded-Forの最後の値を使う(先頭側はクライアントが偽装できる)。
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// ===== Originの確認 =====
// 同一オリジン(ページを配信したホスト)からの接続だけを許可する。
// 別ドメインから接続させたい場合は環境変数ALLOWED_ORIGINSにカンマ区切りで指定する(例: https://example.com)
var allowedOrigins = func() map[string]bool {
	m := make(map[string]bool)
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			m[strings.ToLower(o)] = true
		}
	}
	return m
}()

func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// ブラウザは必ずOriginを付ける。付かないのはブラウザ以外のクライアントで、
		// それらはOriginを自由に偽装できるため拒否しても防御にならない(gorillaの既定と同じ扱い)
		return true
	}
	if allowedOrigins[strings.ToLower(origin)] {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

// ===== 入力値の検証 =====
// プレイヤー名: 前後の空白を除いて1〜maxNameLength文字、制御文字(改行など)を含まない
func validateName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > maxNameLength {
		return "", false
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return "", false
		}
	}
	return name, true
}

// ID指定参加のルームID: 1〜maxRoomIDLength文字、制御文字を含まない
func validateRoomID(id string) bool {
	if id == "" || utf8.RuneCountInString(id) > maxRoomIDLength {
		return false
	}
	for _, r := range id {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
