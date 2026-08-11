export function RoundResultModal({ message, onNext }) {
  return (
    <div className="modal">
      <div className="modal-content">
        <h2>ゲーム結果</h2>
        <p>{message}</p>
        <button onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
