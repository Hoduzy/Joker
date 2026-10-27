import { openGame } from './helpers';
import { describe, expect, it } from 'vitest';
import { bondLevel, giftXp, ownsMember, pendingEvents, unlockedLines } from '../src/core/bond';
import { battleScore, rivalHp } from '../src/core/dungeon';
import { cardStats, enhanceSuccessRate, listenersPerSecond, maxCardLevel, slotPower, type CardProgress } from '../src/core/economy';
import { missionsForDay, refreshMissions } from '../src/core/missions';
import { isUnlocked, newlyUnlocked, nextUnlock, slotUnlocked } from '../src/core/unlocks';
import { unreadTotal } from '../src/core/phone';
import { migrate } from '../src/core/save';
import { SAVE_VERSION, createInitialState } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { CARDS, getCard } from '../src/data/cards';
import { SLOTS } from '../src/data/slots';
import { MEMBERS } from '../src/data/members';
import { BACKGROUNDS, CHAPTERS, ENDINGS, EPISODES, NARRATIVE, getEpisode } from '../src/data/narrative';
import { episodeAvailable, nextEpisode, pickEnding, withName } from '../src/core/story';
import { EXPRESSIONS, standUrl } from '../src/data/portraits';

describe('narrative data', () => {
  it('has 10 chapters of 5 episodes, endings, 5 events, 10 texts and 10 bond lines per member', () => {
    expect(CHAPTERS).toHaveLength(10);
    for (const c of CHAPTERS) expect(c.episodes).toHaveLength(5);
    expect(CHAPTERS.map((c) => c.unlock)).toEqual([100, 1000, 10000, 30000, 50000, 100000, 200000, 400000, 700000, 1000000]);
    expect(ENDINGS.map((e) => e.id).sort()).toEqual([...MEMBERS.map((m) => m.id), 'true'].sort());
    for (const m of MEMBERS) {
      expect(NARRATIVE.events[m.id].map((e) => e.level)).toEqual([...BALANCE.bond.eventLevels]);
      expect(NARRATIVE.texts[m.id]).toHaveLength(10);
      expect(NARRATIVE.bond[m.id].lines).toHaveLength(10);
      const last = NARRATIVE.events[m.id].at(-1)!;
      expect(last.lines.some((l) => l.cg === m.id)).toBe(true);
    }
  });

  it('gives every episode at least one choice and 20+ lines', () => {
    for (const ep of EPISODES) {
      expect(ep.lines.some((l) => l.choice), ep.key).toBe(true);
      expect(ep.lines.length, ep.key).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('story progress', () => {
  it('opens chapters by total listeners and episodes in order', () => {
    const g = openGame();
    g.state.totalListeners = 0;
    g.state.story.seen = [];
    expect(episodeAvailable(g.state, EPISODES[0])).toBe(false);
    g.state.totalListeners = 100;
    expect(episodeAvailable(g.state, EPISODES[0])).toBe(true);
    expect(episodeAvailable(g.state, EPISODES[1])).toBe(false);
    g.markStorySeen('1-1');
    expect(nextEpisode(g.state)?.key).toBe('1-2');
    // 다음 챕터 첫 화는 앞 화를 다 봐도 청취자가 모자라면 잠김
    for (let i = 2; i <= 5; i++) g.markStorySeen(`1-${i}`);
    expect(episodeAvailable(g.state, getEpisode('2-1')!)).toBe(false);
    g.state.totalListeners = 1000;
    expect(episodeAvailable(g.state, getEpisode('2-1')!)).toBe(true);
  });

  it('emits a chapter event when crossing its threshold', () => {
    const g = openGame();
    g.state.totalListeners = 950;
    g.state.milestonesReached = 3;
    g.state.assignments.dj = 'haneul-r';
    const got: number[] = [];
    g.on((e) => e.type === 'chapter' && got.push(e.id));
    g.state.lastTick = Date.now() - 60 * 60 * 1000;
    g.advance();
    expect(got).toContain(2);
  });

  it('picks the true ending when everyone is close, else the highest bond', () => {
    const g = openGame();
    for (const m of MEMBERS) g.state.bond[m.id].xp = 0;
    g.state.bond.mirae.xp = 500;
    expect(pickEnding(g.state)?.id).toBe('mirae');
    for (const m of MEMBERS) g.state.bond[m.id].xp = BALANCE.bond.xpTable[5];
    expect(pickEnding(g.state)?.id).toBe('true');
  });

  it('fills in the player name', () => {
    expect(withName('받는 사람 {이름}', '하루')).toBe('받는 사람 하루');
    expect(withName('{이름}!', '')).toBe('나!');
  });
});

describe('save migration v7 → v8', () => {
  it('clears old story progress and keeps a valid name', () => {
    const s = migrate({ version: 7, story: { seen: [1, 2, 3] } }, 0);
    expect(s.story).toEqual({ seen: [], name: '' });
    const t = migrate({ version: 8, story: { seen: ['1-1', 'bad', 'ending:dahye', '1-1'], name: '  아주긴이름입니다요  ' } }, 0);
    expect(t.story.seen).toEqual(['1-1', 'ending:dahye']);
    expect(t.story.name).toBe('아주긴이름입니다');
  });
});

describe('story backgrounds', () => {
  it('starts every chapter and event with a background from assets/bg', () => {
    expect([...BACKGROUNDS]).toEqual(['classroom', 'broadcast', 'hallway', 'rooftop', 'street', 'room']);
    // room은 아직 그림이 없어 그라데이션으로 (assets/bg/room.jpg를 넣으면 그 그림)
    for (const ep of EPISODES) expect(BACKGROUNDS, ep.key).toContain(ep.lines[0].bg);
    for (const m of MEMBERS) for (const ev of NARRATIVE.events[m.id]) expect(BACKGROUNDS).toContain(ev.lines[0].bg);
  });

  it('has all six stand expressions for every member, and falls back to neutral', () => {
    for (const m of MEMBERS) for (const e of EXPRESSIONS) expect(standUrl(m.id, e), `${m.id} ${e}`).toMatchObject({ cropped: true, fallback: false });
    // 다혜는 smile2가 없어서 neutral로
    expect(standUrl('dahye', 'smile2')).toEqual({ ...standUrl('dahye', 'neutral'), fallback: true });
    expect(standUrl('yuri', 'smile2').fallback).toBe(false);
  });
});

describe('bond', () => {
  it('levels by xp table and boosts card stats', () => {
    expect(bondLevel(0)).toBe(1);
    expect(bondLevel(BALANCE.bond.xpTable[1])).toBe(2);
    expect(bondLevel(1e9)).toBe(BALANCE.bond.maxLevel);
    const card = getCard('haneul-r')!;
    expect(cardStats(card, { limitBreak: 0, level: 1, bond: 5 }).voice).toBeGreaterThan(cardStats(card, { limitBreak: 0, level: 1 }).voice);
  });

  it('unlocks one line per level', () => {
    expect(unlockedLines('haneul', 3)).toHaveLength(3);
  });

  it('grows from placement time', () => {
    const g = openGame();
    g.state.assignments.dj = 'haneul-r';
    g.state.lastTick = Date.now() - 10 * 60000;
    g.advance();
    expect(g.state.bond.haneul.xp).toBeCloseTo(10 * BALANCE.bond.placementXpPerMin, 0);
    expect(g.state.bond.dahye.xp).toBe(0);
  });

  it('gives xp for talks up to the daily limit', () => {
    const g = openGame();
    for (let i = 0; i < BALANCE.bond.talksPerDay + 2; i++) g.talk('yuri');
    expect(g.state.bond.yuri.xp).toBe(BALANCE.bond.talkXp * BALANCE.bond.talksPerDay);
  });

  it('allows 3 gifts a day and favorites count double', () => {
    const g = openGame();
    g.state.listeners = 1e12;
    const fav = NARRATIVE.bond.yuri.favorite;
    expect(giftXp('yuri', fav)).toBe(BALANCE.bond.gifts.find((x) => x.id === fav)!.xp * 2);
    for (let i = 0; i < BALANCE.bond.giftsPerDay; i++) expect(g.gift('yuri', 'snack')).not.toBeNull();
    expect(g.gift('yuri', 'snack')).toBeNull();
    expect(g.giftsLeft('yuri')).toBe(0);
  });

  it('opens personal events at levels 2/4/6/8/10', () => {
    const g = openGame();
    g.addBond('mirae', BALANCE.bond.xpTable[3]);
    expect(pendingEvents(g.state, 'mirae')).toEqual([2, 4]);
    g.markEventSeen('mirae', 2);
    expect(pendingEvents(g.state, 'mirae')).toEqual([4]);
  });
});

describe('phone', () => {
  it('delivers a text, takes a reply, and moves to the next one', () => {
    const g = openGame();
    expect(g.sendText('dahye')).toBe(true);
    expect(unreadTotal(g.state)).toBeGreaterThan(0);
    expect(g.sendText('dahye')).toBe(false); // 답장 전에는 다음 문자가 안 온다
    const xp = g.reply('dahye', 0);
    expect(xp).toBe(NARRATIVE.texts.dahye[0].choices[0].xp);
    expect(g.state.phone.threads.dahye.next).toBe(1);
  });

  it('sends a login text only after the interval', () => {
    const g = openGame();
    const now = Date.now();
    g.state.phone.lastLoginText = now;
    g.onSessionStart(now + 1000);
    expect(unreadTotal(g.state)).toBe(0);
    g.onSessionStart(now + BALANCE.phone.loginIntervalMs);
    expect(unreadTotal(g.state)).toBeGreaterThan(0);
  });
});

describe('daily missions', () => {
  it('picks 5 a day with the fixed two first', () => {
    const ids = missionsForDay('2026-10-24');
    expect(ids).toHaveLength(BALANCE.missions.perDay);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual(['box30', 'battle3']);
  });

  it('tracks progress, pays stones, then the all-clear bonus', () => {
    const g = openGame();
    g.advance();
    g.state.stones = 0;
    for (let i = 0; i < 3; i++) g.recordBattle();
    expect(g.claimMission('battle3')).toBe(true);
    expect(g.claimMission('battle3')).toBe(false);
    expect(g.state.stones).toBe(BALANCE.missions.stonesEach);
    expect(g.claimMissionBonus()).toBe(false);
    for (const id of g.state.missions.ids) g.state.missions.progress[id] = 999;
    for (const id of g.state.missions.ids) g.claimMission(id);
    const kits = g.state.kits;
    expect(g.claimMissionBonus()).toBe(true);
    expect(g.state.kits).toBe(kits + BALANCE.missions.allClearKits);
  });
});

describe('kits and battle', () => {
  it('exchanges parts for kits', () => {
    const g = openGame();
    g.state.box.parts = BALANCE.kits.partsPerKit * 2;
    const kits = g.state.kits;
    expect(g.exchangeKits(3)).toBe(false);
    expect(g.exchangeKits(2)).toBe(true);
    expect(g.state.kits).toBe(kits + 2);
    expect(g.state.box.parts).toBe(0);
  });

  it('needs kits to enhance and can fail at high levels', () => {
    const g = openGame();
    g.state.listeners = 1e12;
    g.state.kits = 0;
    expect(g.enhance('haneul-r')).toBeNull();
    g.state.kits = 10;
    g.state.cards['haneul-r'].level = 15;
    expect(enhanceSuccessRate(15)).toBeLessThan(1);
    expect(g.enhance('haneul-r', () => 0.999)).toBe('fail');
    expect(g.state.cards['haneul-r'].level).toBe(15);
    expect(g.enhance('haneul-r', () => 0)).toBe('success');
    expect(enhanceSuccessRate(1)).toBe(1);
  });

  it('gives tickets and kits on a normal win', () => {
    const g = openGame();
    const t = g.state.box.tickets;
    const k = g.state.kits;
    g.winStage(1);
    expect(g.state.box.tickets).toBe(t + BALANCE.dungeon.tickets);
    expect(g.state.kits).toBe(k + BALANCE.dungeon.kits);
  });

  it('lets taps make up a small gap', () => {
    const hp = rivalHp(1);
    const atk = hp / 32;
    expect(battleScore(atk, 0)).toBeLessThan(hp);
    expect(battleScore(atk, 10)).toBeGreaterThanOrEqual(hp);
  });
});

describe('save migration v6 → v7', () => {
  it('adds bond, phone, story, missions and kits', () => {
    const s = migrate({ version: 6 }, 0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.kits).toBe(BALANCE.kits.start);
    expect(s.bond.haneul.xp).toBe(0);
    expect(s.phone.threads.yuri.next).toBe(0);
    expect(s.story.seen).toEqual([]);
    expect(s.missions.ids).toEqual([]);
  });
});

describe('unlocks', () => {
  it('starts as a new club with one DJ seat and opens more by total listeners', () => {
    const s = migrate({ version: 7 }, 0);
    expect(slotUnlocked(s, 'dj')).toBe(true);
    expect(slotUnlocked(s, 'engineer')).toBe(false);
    expect(isUnlocked(s, 'gacha')).toBe(false);
    expect(nextUnlock(s)?.key).toBe('gacha');
    s.totalListeners = BALANCE.unlocks.slots.engineer;
    expect(slotUnlocked(s, 'engineer')).toBe(true);
    expect(newlyUnlocked(0, BALANCE.unlocks.box).map((u) => u.key)).toEqual(['gacha', 'slot:engineer', 'box']);
  });

  it('ignores cards in locked seats and refuses locked features', () => {
    const g = openGame();
    g.state.totalListeners = 0;
    g.state.assignments.dj = 'haneul-r';
    const one = listenersPerSecond(g.state);
    g.state.assignments.engineer = 'mirae-r';
    expect(listenersPerSecond(g.state)).toBe(one);
    g.assign('writer', 'seoyun-r');
    expect(g.state.assignments.writer).toBeNull();
    g.state.stones = 1e6;
    expect(g.pull(1)).toBeNull();
    expect(g.openBox()).toBeNull();
    expect(g.winStage(1)).toBeNull();
  });

  it('emits an unlock event when crossing a threshold', () => {
    const g = openGame();
    g.state.totalListeners = 250;
    g.state.milestonesReached = 1;
    g.state.assignments.dj = 'haneul-r';
    const got: string[] = [];
    g.on((e) => e.type === 'unlock' && got.push(...e.items.map((u) => u.key)));
    g.state.lastTick = Date.now() - 60 * 60 * 1000;
    g.advance();
    expect(got).toContain('slot:engineer');
  });

  it('only picks missions for unlocked features', () => {
    const s = migrate({ version: 7 }, 0);
    s.totalListeners = BALANCE.unlocks.missions;
    refreshMissions(s, '2026-10-25');
    expect(s.missions.ids).not.toContain('accident1');
  });
});

describe('starting club and rarity order', () => {
  it('starts with only the club president on the DJ seat', () => {
    const s = createInitialState(0);
    expect(Object.keys(s.cards)).toEqual(['dahye-r']);
    expect(s.assignments.dj).toBe('dahye-r');
    expect(ownsMember(s, 'haneul')).toBe(false);
  });

  it('keeps members you have not recruited out of talks, gifts and texts', () => {
    const g = openGame();
    for (const id of Object.keys(g.state.cards)) if (!id.startsWith('dahye')) delete g.state.cards[id];
    g.state.listeners = 1e9;
    expect(g.talk('haneul')).toBeNull();
    expect(g.gift('haneul', 'snack')).toBeNull();
    expect(g.sendText('haneul')).toBe(false);
    expect(g.talk('dahye')).not.toBeNull();
  });

  it('a maxed card is always weaker than a fresh card one rarity higher (in its own seat)', () => {
    const maxLb = BALANCE.limitBreak.max;
    const maxed = { limitBreak: maxLb, level: maxCardLevel(maxLb), bond: BALANCE.bond.maxLevel };
    const fresh = { limitBreak: 0, level: 1, bond: 1 };
    const own = (c: (typeof CARDS)[number], p: CardProgress) => slotPower(c, p, SLOTS.find((s) => s.id === c.slot)!);
    const order = ['R', 'SR', 'SSR', 'U'] as const;
    for (let i = 0; i < order.length - 1; i++) {
      const lowMax = Math.max(...CARDS.filter((c) => c.rarity === order[i]).map((c) => own(c, maxed)));
      const highMin = Math.min(...CARDS.filter((c) => c.rarity === order[i + 1]).map((c) => own(c, fresh)));
      expect(lowMax).toBeLessThan(highMin);
    }
  });
});
