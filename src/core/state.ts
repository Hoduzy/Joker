import { BALANCE } from '../data/balance';
import { MEMBERS } from '../data/members';
import { starterCardOf } from '../data/cards';
import { SLOT_IDS, type SlotId } from '../data/slots';

export const SAVE_VERSION = 2;

export interface OwnedCard {
  /** 돌파 단계 0~5 */
  limitBreak: number;
  /** 처음 얻은 시각 (epoch ms) */
  obtainedAt: number;
}

export interface GameState {
  version: number;
  /** 현재 보유 청취자 (재화) */
  listeners: number;
  /** 누적 획득 청취자 (마일스톤 판정용) */
  totalListeners: number;
  towerLevel: number;
  /** 전파석 (뽑기 재화) */
  stones: number;
  /** 지금까지 달성한 청취자 마일스톤 개수 */
  milestonesReached: number;
  /** 보유 카드: 카드 id → 돌파 정보 */
  cards: Record<string, OwnedCard>;
  /** 슬롯별 배치된 카드 id. 비어 있으면 null */
  assignments: Record<SlotId, string | null>;
  gacha: {
    /** 마지막 SSR 이후 뽑은 횟수 (천장 카운트) */
    pity: number;
    totalPulls: number;
  };
  /** 마지막으로 시간이 정산된 시각 (epoch ms) */
  lastTick: number;
}

export function emptyAssignments(): Record<SlotId, string | null> {
  const a = {} as Record<SlotId, string | null>;
  for (const id of SLOT_IDS) a[id] = null;
  return a;
}

/** 부원마다 R 카드 1장씩 */
export function starterCards(now: number): Record<string, OwnedCard> {
  const cards: Record<string, OwnedCard> = {};
  for (const m of MEMBERS) {
    const id = starterCardOf(m.id);
    if (id) cards[id] = { limitBreak: 0, obtainedAt: now };
  }
  return cards;
}

export function createInitialState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    listeners: 0,
    totalListeners: 0,
    towerLevel: 1,
    stones: BALANCE.stones.welcomeGift,
    milestonesReached: 0,
    cards: starterCards(now),
    assignments: emptyAssignments(),
    gacha: { pity: 0, totalPulls: 0 },
    lastTick: now,
  };
}
