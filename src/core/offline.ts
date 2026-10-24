import { BALANCE } from '../data/balance';
import { listenersPerSecond } from './economy';
import type { GameState } from './state';

export interface OfflineResult {
  /** 실제로 보상이 계산된 경과 시간(ms, 상한 적용) */
  elapsedMs: number;
  /** 상한 적용 전 실제 경과 시간(ms) */
  rawElapsedMs: number;
  earned: number;
}

/** 마지막 정산 이후 흐른 시간만큼 청취자를 계산한다. 상태는 변경하지 않는다. */
export function calcOfflineReward(state: GameState, now: number): OfflineResult {
  const rawElapsedMs = Math.max(0, now - state.lastTick);
  const elapsedMs = Math.min(rawElapsedMs, BALANCE.offlineCapMs);
  const earned = listenersPerSecond(state) * (elapsedMs / 1000);
  return { elapsedMs, rawElapsedMs, earned };
}
