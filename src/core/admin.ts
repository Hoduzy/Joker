/** 관리자 치트 패널 설정 (config/admin.json) — 화면 없이도 쓰는 부분 */
import config from '../config/admin.json';

export const ADMIN_PASSWORD = String(config.password ?? '0000');
export const ADMIN_LOGO_TAPS = Number(config.logoTaps) || 7;

/** 로고를 연속으로 n번 탭했는지 세는 함수를 돌려준다 (탭 사이가 1.2초 넘으면 처음부터) */
export function logoTapCounter(onUnlock: () => void, taps = ADMIN_LOGO_TAPS): () => void {
  let count = 0;
  let last = 0;
  return () => {
    const now = performance.now();
    count = now - last > 1200 ? 1 : count + 1;
    last = now;
    if (count >= taps) {
      count = 0;
      onUnlock();
    }
  };
}
