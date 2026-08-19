import { motion } from 'motion/react';

export function RoundResultModal({ message, onNext, nextDisabled = false }) {
  return (
    <motion.div
      className="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="modal-content">
        <h2>ゲーム結果</h2>
        <p>{message}</p>
        <button disabled={nextDisabled} onClick={onNext}>
          {nextDisabled ? '対戦相手を待っています...' : 'Next'}
        </button>
      </div>
    </motion.div>
  );
}
