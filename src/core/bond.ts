import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { NARRATIVE } from '../data/narrative';
import type { BondState, GameState } from './state';

export type GiftId = (typeof BALANCE.bond.gifts)[number]['id'];

/** 누적 호감도 → 레벨 (1~10) */
export function bondLevel(xp: number): number {
  const table = BALANCE.bond.xpTable;
  let level = 1;
  for (let i = 1; i < table.length; i++) if (xp >= table[i]) level = i + 1;
  return Math.min(BALANCE.bond.maxLevel, level);
}

/** 다음 레벨까지 진행도 (최대 레벨이면 null) */
export function bondProgress(xp: number): { level: number; current: number; need: number } | null {
  const level = bondLevel(xp);
  if (level >= BALANCE.bond.maxLevel) return null;
  const table = BALANCE.bond.xpTable;
  return { level, current: xp - table[level - 1], need: table[level] - table[level - 1] };
}

/** 그 부원의 카드를 한 장이라도 가지고 있는지 (= 입부했는지) */
export function ownsMember(state: GameState, memberId: string): boolean {
  return Object.keys(state.cards).some((id) => getCard(id)?.member === memberId);
}

export function memberBondLevel(state: GameState, memberId: string): number {
  return bondLevel(state.bond[memberId]?.xp ?? 0);
}

/** 호감도 레벨에 따른 그 부원 카드 능력치 배율 */
export function bondStatMult(level: number): number {
  return 1 + BALANCE.bond.statPerLevel * (level - 1);
}

/** 날짜가 바뀌었으면 대화·선물 횟수를 초기화 */
export function refreshBondDay(b: BondState, day: string): void {
  if (b.day === day) return;
  b.day = day;
  b.talks = 0;
  b.gifts = 0;
}

export function giftDef(id: string) {
  return BALANCE.bond.gifts.find((g) => g.id === id);
}

export function giftCost(giftId: string, towerLevel: number): number {
  const g = giftDef(giftId);
  if (!g) return Infinity;
  return Math.ceil(BALANCE.bond.giftCostBase * g.costMult * Math.pow(BALANCE.bond.giftCostGrowth, towerLevel - 1));
}

/** 선물 호감도 (좋아하는 선물이면 2배) */
export function giftXp(memberId: string, giftId: string): number {
  const g = giftDef(giftId);
  if (!g) return 0;
  return NARRATIVE.bond[memberId]?.favorite === giftId ? g.xp * 2 : g.xp;
}

/** 지금 레벨에서 열려 있는 호감도 대사 */
export function unlockedLines(memberId: string, level: number) {
  return (NARRATIVE.bond[memberId]?.lines ?? []).slice(0, level);
}

/** 레벨에 도달했지만 아직 안 본 개인 이벤트 레벨들 */
export function pendingEvents(state: GameState, memberId: string): number[] {
  if (!ownsMember(state, memberId)) return [];
  const level = memberBondLevel(state, memberId);
  const seen = state.bond[memberId]?.seenEvents ?? [];
  return (NARRATIVE.events[memberId] ?? []).filter((e) => e.level <= level && !seen.includes(e.level)).map((e) => e.level);
}
