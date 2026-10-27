import { BALANCE } from '../data/balance';
import { getCardStory, hasCardStory, type CardEpisode } from '../data/cardStories';
import type { CardBondState, GameState } from './state';

/**
 * 카드 호감도 (전용 스토리가 있는 카드만). state.cardBond[카드 id]에 쌓인다.
 * 레벨이 오르면 전용 스토리 다음 화가 열린다 (card_stories.json의 episodes[].level).
 */

export function cardBondLevelOf(xp: number): number {
  const table = BALANCE.cardBond.xpTable;
  let level = 1;
  for (let i = 1; i < table.length; i++) if (xp >= table[i]) level = i + 1;
  return Math.min(BALANCE.cardBond.maxLevel, level);
}

export function cardBondLevel(state: GameState, cardId: string): number {
  return cardBondLevelOf(state.cardBond[cardId]?.xp ?? 0);
}

/** 다음 레벨까지: 현재 레벨 안에서 쌓은 양 / 필요한 양 (최대 레벨이면 null) */
export function cardBondProgress(xp: number): { level: number; current: number; need: number } | null {
  const level = cardBondLevelOf(xp);
  if (level >= BALANCE.cardBond.maxLevel) return null;
  const table = BALANCE.cardBond.xpTable;
  return { level, current: xp - table[level - 1], need: table[level] - table[level - 1] };
}

export function cardBondStatMult(level: number): number {
  return 1 + BALANCE.cardBond.statPerLevel * (level - 1);
}

function entry(state: GameState, cardId: string, day: string): CardBondState {
  const b = (state.cardBond[cardId] ??= { xp: 0, day, talks: 0 });
  if (b.day !== day) {
    b.day = day;
    b.talks = 0;
  }
  return b;
}

/**
 * 호감도 더하기 (보유한, 전용 스토리가 있는 카드만). 레벨이 올랐으면 새 레벨, 아니면 null
 */
export function addCardBond(state: GameState, cardId: string, xp: number, day: string): number | null {
  if (xp <= 0 || !state.cards[cardId] || !hasCardStory(cardId)) return null;
  const b = entry(state, cardId, day);
  const before = cardBondLevelOf(b.xp);
  b.xp = Math.min(b.xp + xp, BALANCE.cardBond.xpTable[BALANCE.cardBond.maxLevel - 1]);
  const after = cardBondLevelOf(b.xp);
  return after > before ? after : null;
}

export function cardTalksLeft(state: GameState, cardId: string, day: string): number {
  const b = state.cardBond[cardId];
  const used = b && b.day === day ? b.talks : 0;
  return Math.max(0, BALANCE.cardBond.talksPerDay - used);
}

/** 교감하기: 하루 정해진 횟수까지. 쓴 횟수만 올리고, 호감도는 addCardBond로 */
export function useCardTalk(state: GameState, cardId: string, day: string): boolean {
  if (!state.cards[cardId] || !hasCardStory(cardId) || cardTalksLeft(state, cardId, day) <= 0) return false;
  entry(state, cardId, day).talks += 1;
  return true;
}

/** 전용 스토리 화가 열렸는지: 카드를 보유하고, 호감도가 그 화의 레벨 이상 */
export function cardEpisodeOpen(state: GameState, cardId: string, ep: CardEpisode): boolean {
  if (state.cheat?.storyUnlocked) return true;
  return !!state.cards[cardId] && cardBondLevel(state, cardId) >= ep.level;
}

/** 이 레벨에서 새로 열리는 화 */
export function episodesAtLevel(cardId: string, level: number): CardEpisode[] {
  return getCardStory(cardId)?.episodes.filter((e) => e.level === level) ?? [];
}
