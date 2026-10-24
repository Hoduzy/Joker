import { BALANCE } from '../data/balance';
import { getCard, type CardDef } from '../data/cards';
import { SLOTS, type SlotDef, type SlotId } from '../data/slots';
import { STAT_KEYS, type Stats } from '../data/stats';
import { equipBonuses, type EquipBonuses } from './equipment';
import type { GameState } from './state';

/** 돌파가 반영된 카드 능력치 */
export function cardStats(card: CardDef, limitBreak: number): Stats {
  const mult = 1 + BALANCE.limitBreak.statBonusPerLevel * limitBreak;
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = Math.round(card.stats[key] * mult);
  return out;
}

/** 카드 능력치 + 공용 장비 주 스탯, 그다음 '모든 능력치 %' 적용 */
export function effectiveStats(card: CardDef, limitBreak: number, bonus?: EquipBonuses): Stats {
  const stats = cardStats(card, limitBreak);
  if (!bonus) return stats;
  const mult = 1 + bonus.allStatsPct / 100;
  for (const key of STAT_KEYS) stats[key] = Math.round((stats[key] + bonus.stats[key]) * mult);
  return stats;
}

/** 카드를 특정 슬롯에 넣었을 때의 기여 파워 (담당 슬롯 보너스, 장비 포함) */
export function slotPower(card: CardDef, limitBreak: number, slot: SlotDef, bonus?: EquipBonuses): number {
  const stats = effectiveStats(card, limitBreak, bonus);
  let power = 0;
  for (const key of STAT_KEYS) {
    power += stats[key] * (key === slot.mainStat ? BALANCE.mainStatWeight : BALANCE.subStatWeight);
  }
  return card.slot === slot.id ? power * (1 + BALANCE.slotBonus) : power;
}

export function limitBreakOf(state: GameState, cardId: string): number {
  return state.cards[cardId]?.limitBreak ?? 0;
}

export function isFullLineup(state: GameState): boolean {
  return SLOTS.every((slot) => state.assignments[slot.id] !== null);
}

/** 배치된 카드들의 파워 합 (풀 라인업 보너스 포함) */
export function totalPower(state: GameState): number {
  const bonus = equipBonuses(state);
  let sum = 0;
  for (const slot of SLOTS) {
    const id = state.assignments[slot.id];
    const card = id ? getCard(id) : undefined;
    if (card) sum += slotPower(card, limitBreakOf(state, card.id), slot, bonus);
  }
  return isFullLineup(state) ? sum * BALANCE.fullLineupBonus : sum;
}

export function towerMultiplier(level: number): number {
  return Math.pow(BALANCE.tower.outputGrowth, level - 1);
}

/** 다음 레벨로 올리는 비용 */
export function towerUpgradeCost(level: number): number {
  return Math.ceil(BALANCE.tower.baseCost * Math.pow(BALANCE.tower.costGrowth, level - 1));
}

/** 초당 청취자 증가량 */
export function listenersPerSecond(state: GameState): number {
  const listenersPct = equipBonuses(state).listenersPct;
  return totalPower(state) * BALANCE.listenersPerPower * towerMultiplier(state.towerLevel) * (1 + listenersPct / 100);
}

/**
 * 슬롯 배치 결과. 같은 부원의 다른 카드가 다른 슬롯에 있으면 그 자리는 비운다
 * (한 부원은 한 번에 한 슬롯에만 나갈 수 있다).
 */
export function withAssignment(state: GameState, slotId: SlotId, cardId: string | null): Record<SlotId, string | null> {
  const assignments = { ...state.assignments };
  const card = cardId ? getCard(cardId) : undefined;
  if (card) {
    for (const key of Object.keys(assignments) as SlotId[]) {
      const other = assignments[key];
      if (other && getCard(other)?.member === card.member) assignments[key] = null;
    }
  }
  assignments[slotId] = cardId;
  return assignments;
}

/** 슬롯에 해당 카드를 넣었을 때 초당 증가량 미리보기 */
export function previewRateWith(state: GameState, slotId: SlotId, cardId: string | null): number {
  return listenersPerSecond({ ...state, assignments: withAssignment(state, slotId, cardId) });
}
