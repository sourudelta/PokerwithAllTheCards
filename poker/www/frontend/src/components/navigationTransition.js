import { flushSync } from 'react-dom';

/**
 * View Transitions API で画面(state)の切り替えをアニメーションさせる。
 * update 内の state 更新は flushSync で同期的に DOM へ反映させ、
 * ブラウザが「更新前/更新後」のスナップショットを正しく取れるようにする。
 */
export function runViewTransition(update) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!document.startViewTransition || prefersReducedMotion) {
    // View Transitions API 非対応 or 視差効果を減らす設定の場合は通常の更新
    update();
    return null;
  }

  return document.startViewTransition(() => {
    flushSync(update);
  });
}
