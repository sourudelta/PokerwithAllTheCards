import { useCallback, useEffect, useRef } from 'react';

// 本番・ローカル両対応のWebSocket URLを生成し、接続を維持するフック
export function useGameSocket(onMessage) {
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${wsProtocol}//${location.host}/ws`);

    let closedByCleanup = false;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received message:', message);
      onMessageRef.current(message);
    };

    // サーバー側から切断された場合(接続数制限・無通信タイムアウト・送信詰まりなど)を画面に伝える
    socket.onclose = () => {
      if (!closedByCleanup) {
        onMessageRef.current({ type: 'connection_closed' });
      }
    };

    socketRef.current = socket;
    return () => {
      closedByCleanup = true;
      socket.close();
    };
  }, []);

  return useCallback((data) => {
    socketRef.current?.send(JSON.stringify(data));
  }, []);
}
