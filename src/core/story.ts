import { CHAPTERS, ENDINGS, EPISODES, type Chapter, type Ending, type Episode } from '../data/narrative';
import { MEMBERS } from '../data/members';
import { memberBondLevel } from './bond';
import type { GameState } from './state';

/** 엔딩을 본 기록 키 */
export const endingKey = (id: string) => `ending:${id}`;

export function chapterOpen(state: Pick<GameState, 'totalListeners'>, chapter: Chapter): boolean {
  return state.totalListeners >= chapter.unlock;
}

/** 다음에 볼 화 (다 봤으면 undefined) */
export function nextEpisode(state: GameState): Episode | undefined {
  return EPISODES.find((e) => !state.story.seen.includes(e.key));
}

/** 지금 볼 수 있는 화인지: 이미 봤거나, 다음 화이고 그 챕터가 열려 있으면 */
export function episodeAvailable(state: GameState, ep: Episode): boolean {
  if (state.story.seen.includes(ep.key)) return true;
  const next = nextEpisode(state);
  const chapter = CHAPTERS.find((c) => c.id === ep.chapter);
  return next?.key === ep.key && !!chapter && chapterOpen(state, chapter);
}

/** 볼 수 있는데 아직 안 본 화가 있는지 (탭 점) */
export function hasNewEpisode(state: GameState): boolean {
  const next = nextEpisode(state);
  return !!next && episodeAvailable(state, next);
}

export function storyFinished(state: GameState): boolean {
  return EPISODES.every((e) => state.story.seen.includes(e.key));
}

/**
 * 마지막 화를 본 뒤의 엔딩: 다섯 명 모두 진엔딩 기준 호감도 이상이면 진엔딩,
 * 아니면 호감도가 가장 높은 부원의 엔딩 (같으면 누적 호감도가 높은 쪽)
 */
export function pickEnding(state: GameState): Ending | undefined {
  const trueEnding = ENDINGS.find((e) => e.id === 'true');
  if (trueEnding && MEMBERS.every((m) => memberBondLevel(state, m.id) >= (trueEnding.minLevel ?? 1))) return trueEnding;
  const best = [...MEMBERS].sort((a, b) => (state.bond[b.id]?.xp ?? 0) - (state.bond[a.id]?.xp ?? 0))[0];
  return ENDINGS.find((e) => e.id === best?.id);
}

/** before → after 사이에 새로 열린 챕터 */
export function newlyOpenedChapters(before: number, after: number): Chapter[] {
  return CHAPTERS.filter((c) => before < c.unlock && after >= c.unlock);
}

/** 대사 속 {이름}을 주인공 이름으로 */
export function withName(text: string, name: string): string {
  return text.split('{이름}').join(name || '나');
}
