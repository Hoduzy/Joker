import { describe, expect, it } from 'vitest';
import { addCardBond, cardBondLevel, cardBondLevelOf, cardEpisodeOpen, cardTalksLeft, useCardTalk } from '../src/core/cardBond';
import { cardStats, progressOf } from '../src/core/economy';
import { Game } from '../src/core/game';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { getCard } from '../src/data/cards';
import { CARD_STORY_IDS, getCardEpisode, getCardStory } from '../src/data/cardStories';
import type { ScriptLine } from '../src/data/narrative';

const SEOYUN = 'seoyun-halloween-u';
const MIRAE = 'mirae-halloween-u';
const DAY = '2026-10-30';

/** 선택지 안쪽까지 센 대사 줄 수 (보기마다 다른 길이면 짧은 쪽) */
function lineCount(lines: readonly ScriptLine[]): number {
  return lines.reduce((n, l) => n + (l.choice ? 1 + Math.min(...l.choice.map((c) => lineCount(c.then ?? []))) : 1), 0);
}

function owning(...ids: string[]) {
  const s = createInitialState(0);
  for (const id of ids) s.cards[id] = { limitBreak: 0, level: 1, obtainedAt: 0 };
  return s;
}

describe('card_stories.json', () => {
  it('has 5 episodes for each U card, unlocked at Lv.1/3/5/6/7, 25~40 lines each', () => {
    expect(CARD_STORY_IDS.sort()).toEqual([MIRAE, SEOYUN]);
    for (const id of CARD_STORY_IDS) {
      const s = getCardStory(id)!;
      expect(getCard(id)?.rarity).toBe('U');
      expect(s.episodes.map((e) => e.level)).toEqual([1, 3, 5, 6, 7]);
      for (const ep of s.episodes) {
        const n = lineCount(ep.lines);
        expect(n, `${id} ${ep.no}화 ${n}줄`).toBeGreaterThanOrEqual(25);
        expect(n, `${id} ${ep.no}화 ${n}줄`).toBeLessThanOrEqual(40);
        // 배경·bgm 지정, 그 카드의 부원이 나온다
        expect(ep.lines[0].bg).toBeTruthy();
        expect(ep.lines.some((l) => l.bgm)).toBe(true);
        expect(ep.lines.some((l) => l.s === getCard(id)!.member)).toBe(true);
      }
      expect(s.talks.length).toBeGreaterThan(0);
    }
  });

  it('episode keys round-trip', () => {
    expect(getCardEpisode(`card:${SEOYUN}:2`)?.episode.title).toBe('평소와 다른 거리');
    expect(getCardEpisode(`card:${SEOYUN}:9`)).toBeUndefined();
  });
});

describe('card bond', () => {
  it('levels follow the xp table and cap at max', () => {
    const t = BALANCE.cardBond.xpTable;
    expect(cardBondLevelOf(0)).toBe(1);
    expect(cardBondLevelOf(t[2])).toBe(3);
    expect(cardBondLevelOf(99999)).toBe(BALANCE.cardBond.maxLevel);
  });

  it('only owned story cards gain bond; level-up is reported', () => {
    const s = owning(SEOYUN);
    expect(addCardBond(s, MIRAE, 100, DAY)).toBeNull(); // 미보유
    expect(addCardBond(s, 'dahye-r', 100, DAY)).toBeNull(); // 스토리 없는 카드
    expect(addCardBond(s, SEOYUN, BALANCE.cardBond.xpTable[1], DAY)).toBe(2);
    expect(cardBondLevel(s, SEOYUN)).toBe(2);
  });

  it('unlocks episodes 1 → 2 → 3 with bond level', () => {
    const s = owning(SEOYUN);
    const eps = getCardStory(SEOYUN)!.episodes;
    expect(eps.map((e) => cardEpisodeOpen(s, SEOYUN, e))).toEqual([true, false, false, false, false]);
    addCardBond(s, SEOYUN, BALANCE.cardBond.xpTable[2], DAY);
    expect(eps.map((e) => cardEpisodeOpen(s, SEOYUN, e))).toEqual([true, true, false, false, false]);
    addCardBond(s, SEOYUN, BALANCE.cardBond.xpTable[5] - BALANCE.cardBond.xpTable[2], DAY);
    expect(eps.map((e) => cardEpisodeOpen(s, SEOYUN, e))).toEqual([true, true, true, true, false]);
    addCardBond(s, SEOYUN, 10000, DAY);
    expect(eps.map((e) => cardEpisodeOpen(s, SEOYUN, e))).toEqual([true, true, true, true, true]);
    // 보유하지 않으면 1화도 잠김
    expect(cardEpisodeOpen(createInitialState(0), SEOYUN, eps[0])).toBe(false);
  });

  it('talks are limited per day', () => {
    const s = owning(MIRAE);
    for (let i = 0; i < BALANCE.cardBond.talksPerDay; i++) expect(useCardTalk(s, MIRAE, DAY)).toBe(true);
    expect(useCardTalk(s, MIRAE, DAY)).toBe(false);
    expect(cardTalksLeft(s, MIRAE, '2026-10-31')).toBe(BALANCE.cardBond.talksPerDay);
  });

  it('raises the card stats per level', () => {
    const s = owning(SEOYUN);
    const card = getCard(SEOYUN)!;
    const base = cardStats(card, progressOf(s, SEOYUN)).voice;
    addCardBond(s, SEOYUN, 10000, DAY);
    expect(cardStats(card, progressOf(s, SEOYUN)).voice).toBeGreaterThan(base);
  });

  it('Game: talking, placement and duplicates add bond; choice xp goes to the card', () => {
    const g = new Game(0);
    g.state.cards[SEOYUN] = { limitBreak: 0, level: 1, obtainedAt: 0 };
    const levels: number[] = [];
    g.on((e) => e.type === 'card-bond' && levels.push(e.level));
    expect(g.talkCard(SEOYUN)?.t).toBeTruthy();
    expect(g.state.cardBond[SEOYUN].xp).toBe(BALANCE.cardBond.talkXp);
    g.applyCardChoiceXp(SEOYUN, { seoyun: 20, mirae: 99 });
    expect(g.state.cardBond[SEOYUN].xp).toBe(BALANCE.cardBond.talkXp + 20);
    g.addCardBond(SEOYUN, 1000);
    expect(levels.at(-1)).toBe(BALANCE.cardBond.maxLevel);
  });
});

describe('save v9 → v10', () => {
  it('adds cardBond and keeps card story seen keys', () => {
    const st = owning(SEOYUN);
    st.story.seen = ['1-1', `card:${SEOYUN}:1`];
    const old = { ...JSON.parse(JSON.stringify(st)), version: 9 } as Record<string, unknown>;
    delete old.cardBond;
    const s = migrate(old, 1000);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.cardBond).toEqual({});
    expect(s.story.seen).toContain(`card:${SEOYUN}:1`);
  });

  it('drops bond for cards not owned', () => {
    const st = owning(SEOYUN);
    st.cardBond = { [SEOYUN]: { xp: 70, day: DAY, talks: 1 }, [MIRAE]: { xp: 50, day: DAY, talks: 0 } };
    const s = migrate(JSON.parse(JSON.stringify(st)), 1000);
    expect(s.cardBond[SEOYUN].xp).toBe(70);
    expect(s.cardBond[MIRAE]).toBeUndefined();
  });
});
