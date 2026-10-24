import { SLOT_IDS, type SlotId } from '../data/slots';

export const SAVE_VERSION = 1;

export interface GameState {
  version: number;
  /** 현재 보유 청취자 (재화) */
  listeners: number;
  /** 누적 획득 청취자 (통계/향후 업적용) */
  totalListeners: number;
  towerLevel: number;
  /** 슬롯별 배치된 부원 id. 비어 있으면 null */
  assignments: Record<SlotId, string | null>;
  /** 보유한 부원 id 목록 (가챠 도입 시 여기에 추가) */
  ownedMembers: string[];
  /** 마지막으로 시간이 정산된 시각 (epoch ms) */
  lastTick: number;
}

export function createInitialState(now: number): GameState {
  const assignments = {} as Record<SlotId, string | null>;
  for (const id of SLOT_IDS) assignments[id] = null;
  return {
    version: SAVE_VERSION,
    listeners: 0,
    totalListeners: 0,
    towerLevel: 1,
    assignments,
    ownedMembers: ['haneul', 'mirae', 'seoyun', 'yuri', 'dahye'],
    lastTick: now,
  };
}
