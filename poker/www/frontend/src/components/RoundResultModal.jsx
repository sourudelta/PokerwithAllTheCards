export function RoundResultModal({ message, onNext, nextDisabled = false }) {
  return (
    <div className="modal">
      <div className="modal-content">
        <h2>ゲーム結果</h2>
        <p>{message}</p>
        <button disabled={nextDisabled} onClick={onNext}>
          {nextDisabled ? '対戦相手を待っています...' : 'Next'}
        </button>
      </div>
    </div>
  );
}
