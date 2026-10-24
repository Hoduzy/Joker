import type { StatKey } from './stats';

export type SlotId = 'dj' | 'engineer' | 'writer' | 'guest';

export interface SlotDef {
  id: SlotId;
  name: string;
  /** 이 슬롯에서 가장 크게 반영되는 능력치 */
  mainStat: StatKey;
  description: string;
}

export const SLOTS: readonly SlotDef[] = [
  { id: 'dj', name: 'DJ', mainStat: 'voice', description: '목소리가 청취자를 붙잡는다' },
  { id: 'engineer', name: '엔지니어', mainStat: 'tech', description: '깨끗한 송출이 기본' },
  { id: 'writer', name: '작가', mainStat: 'writing', description: '원고가 방송의 뼈대' },
  { id: 'guest', name: '게스트', mainStat: 'charm', description: '화제성이 곧 청취율' },
];

export const SLOT_IDS: readonly SlotId[] = SLOTS.map((s) => s.id);
