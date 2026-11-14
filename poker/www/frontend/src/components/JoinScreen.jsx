import { useState } from 'react';

// searching: null | 'room'(ルームID指定で待機中) | 'random'(ランダムマッチング待機中)
export function JoinScreen({ searching, onJoin, onRandomMatch, onCancelMatch }) {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleJoinClick = () => {
    if (!roomId || !playerName) {
      alert('ルームIDとプレイヤー名を入力してください');
      return;
    }
    onJoin(roomId, playerName);
  };

  const handleRandomClick = () => {
    if (!playerName) {
      alert('プレイヤー名を入力してください');
      return;
    }
    onRandomMatch(playerName);
  };

  return (
    <div id="join-overlay">
      <div id="setup-container">
        <div className="input-group">
          <label htmlFor="playerName">プレイヤー名:</label>
          <input
            id="playerName"
            type="text"
            placeholder="プレイヤー名を入力"
            maxLength={20}
            value={playerName}
            disabled={!!searching}
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label htmlFor="roomId">ルームID (友達と遊ぶ場合):</label>
          <input
            id="roomId"
            type="text"
            placeholder="ルームIDを入力"
            maxLength={32}
            value={roomId}
            disabled={!!searching}
            onChange={(e) => setRoomId(e.target.value)}
          />
        </div>
      </div>

      {searching === 'random' ? (
        <>
          <button disabled>対戦相手を探しています...</button>
          <button onClick={onCancelMatch}>キャンセル</button>
        </>
      ) : (
        <>
          <button disabled={!!searching} onClick={handleRandomClick}>
            ランダムマッチ
          </button>
          <button disabled={!!searching} onClick={handleJoinClick}>
            {searching === 'room' ? '対戦相手を待っています...' : 'ルームに参加'}
          </button>
        </>
      )}
    </div>
  );
}
