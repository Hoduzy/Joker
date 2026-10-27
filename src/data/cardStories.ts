/**
 * 카드 전용 스토리 (card_stories.json). 메인 스토리와 별개로, 그 카드를 보유하면 카드 호감도 레벨에 따라 화가 열린다.
 *
 *   "<카드 id>": {
 *     title, note                     목록 제목, 한 줄 설명
 *     talks: [{ e, t }]               카드 상세 '교감하기'에서 하는 한마디 (표정·대사)
 *     episodes: [{ title, level, frequency, lines }]
 *                                     level = 이 화가 열리는 카드 호감도 레벨. lines 형식은 메인 스토리와 같다
 *   }
 * 본 기록 키는 "card:<카드 id>:<화>"
 */
import raw from './card_stories.json';
import { BALANCE } from './balance';
import { getCard } from './cards';
import { checkLines, type ScriptLine } from './narrative';
import { EXPRESSIONS, type Expression } from './portraits';

export interface CardEpisode {
  key: string;
  no: number;
  title: string;
  level: number;
  frequency: string;
  lines: ScriptLine[];
}

export interface CardStory {
  cardId: string;
  title: string;
  note: string;
  talks: { e: Expression; t: string }[];
  episodes: CardEpisode[];
}

function load(): Map<string, CardStory> {
  const out = new Map<string, CardStory>();
  for (const [cardId, s] of Object.entries(raw as Record<string, any>)) {
    if (cardId.startsWith('_')) continue;
    const w = `card_stories.json "${cardId}"`;
    if (!getCard(cardId)) throw new Error(`${w}: 알 수 없는 카드`);
    const talks = (Array.isArray(s.talks) ? s.talks : []).map((t: any, i: number) => {
      if (typeof t.t !== 'string') throw new Error(`${w} talks[${i}]: 대사(t)가 없습니다`);
      if (t.e !== undefined && !(EXPRESSIONS as readonly string[]).includes(t.e)) throw new Error(`${w} talks[${i}]: 표정 "${t.e}"`);
      return { e: t.e ?? 'neutral', t: t.t };
    });
    const episodes: CardEpisode[] = (Array.isArray(s.episodes) ? s.episodes : []).map((ep: any, i: number) => {
      const level = ep.level ?? 1;
      if (!Number.isInteger(level) || level < 1 || level > BALANCE.cardBond.maxLevel) throw new Error(`${w} episodes[${i}]: level은 1~${BALANCE.cardBond.maxLevel}`);
      return {
        key: `card:${cardId}:${i + 1}`,
        no: i + 1,
        title: ep.title,
        level,
        frequency: typeof ep.frequency === 'number' ? ep.frequency.toFixed(1) : String(ep.frequency ?? '89.7'),
        lines: checkLines(ep.lines, `${w} episodes[${i}]`),
      };
    });
    if (!episodes.length) throw new Error(`${w}: episodes가 비어 있습니다`);
    out.set(cardId, { cardId, title: s.title ?? cardId, note: s.note ?? '', talks, episodes });
  }
  return out;
}

const STORIES = load();

export const getCardStory = (cardId: string) => STORIES.get(cardId);
export const hasCardStory = (cardId: string) => STORIES.has(cardId);
export const CARD_STORY_IDS = [...STORIES.keys()];

/** "card:<카드 id>:<화>" → 카드·화 */
export function getCardEpisode(key: string): { story: CardStory; episode: CardEpisode } | undefined {
  const m = /^card:([\w-]+):(\d+)$/.exec(key);
  const story = m ? STORIES.get(m[1]) : undefined;
  const episode = story?.episodes[Number(m![2]) - 1];
  return story && episode ? { story, episode } : undefined;
}
