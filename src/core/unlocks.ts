import { BALANCE } from '../data/balance';
import { SLOTS, type SlotId } from '../data/slots';
import type { GameState } from './state';

/** 누적 청취자로 열리는 기능 */
export type Feature = Exclude<keyof typeof BALANCE.unlocks, 'slots'>;

export const FEATURE_LABELS: Record<Feature, string> = {
  gacha: '부원 모집(뽑기)',
  box: '협찬 택배',
  enhance: '카드 강화',
  legend: '레전드 사연',
  dungeon: '라이벌 대결',
  missions: '일일 미션',
  accident: '방송사고',
};

export interface UnlockDef {
  key: string;
  label: string;
  at: number;
  /** 자리면 슬롯 id */
  slot?: SlotId;
  feature?: Feature;
}

/** 해금 목록 (열리는 순서대로) */
export const UNLOCKS: readonly UnlockDef[] = [
  ...SLOTS.map((s) => ({ key: `slot:${s.id}`, label: `${s.name} 자리`, at: BALANCE.unlocks.slots[s.id], slot: s.id })),
  ...(Object.keys(FEATURE_LABELS) as Feature[]).map((f) => ({ key: f, label: FEATURE_LABELS[f], at: BALANCE.unlocks[f], feature: f })),
]
  .filter((u) => u.at > 0)
  .sort((a, b) => a.at - b.at);

export function slotUnlocked(state: Pick<GameState, 'totalListeners'>, slotId: SlotId): boolean {
  return state.totalListeners >= BALANCE.unlocks.slots[slotId];
}

export function isUnlocked(state: Pick<GameState, 'totalListeners'>, feature: Feature): boolean {
  return state.totalListeners >= BALANCE.unlocks[feature];
}

/** 다음에 열릴 것 (모두 열렸으면 undefined) */
export function nextUnlock(state: Pick<GameState, 'totalListeners'>): UnlockDef | undefined {
  return UNLOCKS.find((u) => state.totalListeners < u.at);
}

/** before → after 사이에 새로 열린 것들 */
export function newlyUnlocked(before: number, after: number): UnlockDef[] {
  return UNLOCKS.filter((u) => before < u.at && after >= u.at);
}
