import { BALANCE } from '../data/balance';
import { getMember, type MemberDef } from '../data/members';
import { SLOTS, type SlotDef } from '../data/slots';
import { STAT_KEYS } from '../data/stats';
import type { GameState } from './state';

/** 특정 부원이 특정 슬롯에 들어갔을 때의 기여 파워 */
export function slotPower(member: MemberDef, slot: SlotDef): number {
  let power = 0;
  for (const key of STAT_KEYS) {
    const weight = key === slot.mainStat ? BALANCE.mainStatWeight : BALANCE.subStatWeight;
    power += member.stats[key] * weight;
  }
  return power;
}

export function isFullLineup(state: GameState): boolean {
  return SLOTS.every((slot) => state.assignments[slot.id] !== null);
}

/** 배치된 부원들의 파워 합 (풀 라인업 보너스 포함) */
export function totalPower(state: GameState): number {
  let sum = 0;
  for (const slot of SLOTS) {
    const id = state.assignments[slot.id];
    const member = id ? getMember(id) : undefined;
    if (member) sum += slotPower(member, slot);
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
  return totalPower(state) * BALANCE.listenersPerPower * towerMultiplier(state.towerLevel);
}

/** 슬롯에 해당 부원을 넣었을 때 초당 증가량 미리보기 */
export function previewRateWith(state: GameState, slotId: SlotDef['id'], memberId: string | null): number {
  const assignments = { ...state.assignments };
  for (const key of Object.keys(assignments) as SlotDef['id'][]) {
    if (memberId !== null && assignments[key] === memberId) assignments[key] = null;
  }
  assignments[slotId] = memberId;
  return listenersPerSecond({ ...state, assignments });
}
