import { useCallback, useEffect, useRef } from 'react';

// 本番・ローカル両対応のWebSocket URLを生成し、接続を維持するフック
export function useGameSocket(onMessage) {
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${wsProtocol}//${location.host}/ws`);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received message:', message);
      onMessageRef.current(message);
    };

    socketRef.current = socket;
    return () => socket.close();
  }, []);

  return useCallback((data) => {
    socketRef.current?.send(JSON.stringify(data));
  }, []);
}
