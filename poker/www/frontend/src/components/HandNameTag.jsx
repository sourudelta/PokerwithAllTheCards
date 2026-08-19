import { motion } from 'motion/react';

// 役名を表示するタグ。resultPhaseに応じて自分/相手の役の下・上にフェードインする
export function HandNameTag({ label, name }) {
  return (
    <motion.div
      className="hand-name-tag"
      initial={{ opacity: 0, y: -10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {label}: {name}
    </motion.div>
  );
}
