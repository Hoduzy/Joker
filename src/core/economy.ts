import { BALANCE } from '../data/balance';
import { getCard, type CardDef } from '../data/cards';
import { SLOTS, type SlotDef, type SlotId } from '../data/slots';
import { STAT_KEYS, type Stats } from '../data/stats';
import { getCorner } from '../data/flavor';
import { bondStatMult, memberBondLevel } from './bond';
import { slotUnlocked } from './unlocks';
import { equipBonuses, type EquipBonuses } from './equipment';
import { eventListenerMultiplier } from './events';
import type { GameState } from './state';

/** 카드 성장 상태: 돌파 단계와 강화 레벨 */
export interface CardProgress {
  limitBreak: number;
  level: number;
  /** 그 부원의 호감도 레벨 (생략하면 1) */
  bond?: number;
}

export const BASE_PROGRESS: CardProgress = { limitBreak: 0, level: 1 };

export function progressOf(state: GameState, cardId: string): CardProgress {
  const owned = state.cards[cardId];
  const card = getCard(cardId);
  const bond = card ? memberBondLevel(state, card.member) : 1;
  return owned ? { limitBreak: owned.limitBreak, level: owned.level, bond } : { ...BASE_PROGRESS, bond };
}

/** 강화에 드는 튜닝 키트 수 */
export function enhanceKits(level: number): number {
  return BALANCE.enhance.kitsPerTenLevels * (1 + Math.floor((level - 1) / 10));
}

/** 레벨 n → n+1 강화 성공 확률 */
export function enhanceSuccessRate(level: number): number {
  const e = BALANCE.enhance;
  if (level <= e.safeUntil) return 1;
  return Math.max(e.minSuccess, 1 - e.failStep * (level - e.safeUntil));
}

/** 강화 최대 레벨 (돌파할수록 올라간다) */
export function maxCardLevel(limitBreak: number): number {
  return BALANCE.enhance.maxLevelBase + BALANCE.enhance.maxLevelPerLimitBreak * limitBreak;
}

/** 레벨 n → n+1 강화 비용 (청취자) */
export function enhanceCost(card: CardDef, level: number): number {
  return Math.ceil(BALANCE.enhance.costBase[card.rarity] * Math.pow(BALANCE.enhance.costGrowth, level - 1));
}

/** 돌파·강화가 반영된 카드 능력치 */
export function cardStats(card: CardDef, progress: CardProgress = BASE_PROGRESS): Stats {
  const mult =
    (1 + BALANCE.limitBreak.statBonusPerLevel * progress.limitBreak) *
    (1 + BALANCE.enhance.statPerLevel * (progress.level - 1)) *
    bondStatMult(progress.bond ?? 1);
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = Math.round(card.stats[key] * mult);
  return out;
}

/** 카드 능력치 + 공용 장비 주 스탯, 그다음 '모든 능력치 %' 적용 */
export function effectiveStats(card: CardDef, progress: CardProgress, bonus?: EquipBonuses): Stats {
  const stats = cardStats(card, progress);
  if (!bonus) return stats;
  const mult = 1 + bonus.allStatsPct / 100;
  for (const key of STAT_KEYS) stats[key] = Math.round((stats[key] + bonus.stats[key]) * mult);
  return stats;
}

/** 카드를 특정 슬롯에 넣었을 때의 기여 파워 (담당 슬롯 보너스, 장비 포함) */
export function slotPower(card: CardDef, progress: CardProgress, slot: SlotDef, bonus?: EquipBonuses): number {
  const stats = effectiveStats(card, progress, bonus);
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
  const cornerSlot = getCorner(state.corner.id)?.slot;
  let sum = 0;
  for (const slot of SLOTS) {
    const id = state.assignments[slot.id];
    const card = id ? getCard(id) : undefined;
    if (!card || !slotUnlocked(state, slot.id)) continue;
    const power = slotPower(card, progressOf(state, card.id), slot, bonus);
    // 오늘의 코너가 미는 슬롯
    sum += slot.id === cornerSlot ? power * (1 + BALANCE.cornerBonus) : power;
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

/** 초당 청취자 증가량 (진행 중인 시즌 이벤트의 U 카드를 배치하면 보너스) */
export function listenersPerSecond(state: GameState): number {
  const listenersPct = equipBonuses(state).listenersPct;
  return totalPower(state) * BALANCE.listenersPerPower * towerMultiplier(state.towerLevel) * (1 + listenersPct / 100) * eventListenerMultiplier(state, state.lastTick);
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
