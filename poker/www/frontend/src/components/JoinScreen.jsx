import { useState } from 'react';

export function JoinScreen({ searching, onJoin }) {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleClick = () => {
    if (!roomId || !playerName) {
      alert('ルームIDとプレイヤー名を入力してください');
      return;
    }
    onJoin(roomId, playerName);
  };

  return (
    <div id="join-overlay">
      <div id="setup-container">
        <div className="input-group">
          <label htmlFor="roomId">ルームID:</label>
          <input
            id="roomId"
            type="text"
            placeholder="ルームIDを入力"
            value={roomId}
            disabled={searching}
            onChange={(e) => setRoomId(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label htmlFor="playerName">プレイヤー名:</label>
          <input
            id="playerName"
            type="text"
            placeholder="プレイヤー名を入力"
            value={playerName}
            disabled={searching}
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </div>
      </div>
      <button disabled={searching} onClick={handleClick}>
        {searching ? '対戦相手を探しています...' : 'ルームに参加'}
      </button>
    </div>
  );
}
