import { describe, expect, it } from 'vitest';
import { cardEpisodeOpen } from '../src/core/cardBond';
import { activeEvent, convertEndedEvents, eventProgress, eventPull } from '../src/core/events';
import { pull } from '../src/core/gacha';
import { Game } from '../src/core/game';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { chapterOpen, episodeAvailable } from '../src/core/story';
import { pendingEvents } from '../src/core/bond';
import { getCardStory } from '../src/data/cardStories';
import { getEvent } from '../src/data/events';
import { CHAPTERS, EPISODES } from '../src/data/narrative';
import { logoTapCounter, ADMIN_PASSWORD } from '../src/core/admin';

const ev = getEvent('halloween-2026')!;
const DURING = Date.parse('2026-10-30T12:00:00+09:00');

describe('admin config', () => {
  it('password comes from config (default 0000)', () => {
    expect(ADMIN_PASSWORD).toBe('0000');
  });

  it('logo needs 7 quick taps', () => {
    let opened = 0;
    const tap = logoTapCounter(() => opened++);
    for (let i = 0; i < 6; i++) tap();
    expect(opened).toBe(0);
    tap();
    expect(opened).toBe(1);
  });
});

describe('cheat mark', () => {
  it('game.cheat marks the save once and counts uses', () => {
    const g = new Game(0);
    expect(g.state.cheat.used).toBe(false);
    g.cheat((s) => (s.stones += 100), 1234);
    g.cheat((s) => (s.stones += 100), 5678);
    expect(g.state.cheat).toMatchObject({ used: true, firstUsedAt: 1234, count: 2 });
  });

  it('survives save migration; old saves get a clean record', () => {
    const st = createInitialState(0);
    st.cheat.used = true;
    st.cheat.count = 3;
    st.cheat.firstUsedAt = 99;
    expect(migrate(JSON.parse(JSON.stringify(st)), 1000).cheat).toMatchObject({ used: true, count: 3, firstUsedAt: 99 });
    const old = { ...JSON.parse(JSON.stringify(createInitialState(0))), version: 10 } as Record<string, unknown>;
    delete old.cheat;
    const s = migrate(old, 1000);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.cheat.used).toBe(false);
  });
});

describe('gacha cheats', () => {
  it('fixes the rarity of standard pulls, including U', () => {
    const s = createInitialState(0);
    s.cheat.nextRarity = 'SSR';
    expect(pull(s, 10).every((r) => r.card.rarity === 'SSR')).toBe(true);
    s.cheat.nextRarity = 'U';
    expect(pull(s, 3).every((r) => r.card.rarity === 'U')).toBe(true);
  });

  it('fixes the rarity of event pulls', () => {
    const s = createInitialState(0);
    eventProgress(s, ev.id, DURING).candy = 1000;
    s.cheat.nextRarity = 'R';
    expect(eventPull(s, 10, Math.random, DURING)!.every((r) => r.card.rarity === 'R')).toBe(true);
  });
});

describe('story unlock cheat', () => {
  it('opens every chapter, episode, bond event and card story', () => {
    const s = createInitialState(0);
    const last = EPISODES[EPISODES.length - 1];
    const ep = getCardStory('mirae-halloween-u')!.episodes[2];
    expect(chapterOpen(s, CHAPTERS[CHAPTERS.length - 1])).toBe(false);
    expect(episodeAvailable(s, last)).toBe(false);
    expect(cardEpisodeOpen(s, 'mirae-halloween-u', ep)).toBe(false);
    s.cheat.storyUnlocked = true;
    expect(chapterOpen(s, CHAPTERS[CHAPTERS.length - 1])).toBe(true);
    expect(episodeAvailable(s, last)).toBe(true);
    expect(cardEpisodeOpen(s, 'mirae-halloween-u', ep)).toBe(true);
    expect(pendingEvents(s, 'dahye').length).toBe(5);
  });
});

describe('time & event cheats', () => {
  it('forced end closes a live event and converts its candy', () => {
    const s = createInitialState(0);
    eventProgress(s, ev.id, DURING).candy = 10;
    expect(activeEvent(s, DURING)?.id).toBe(ev.id);
    s.cheat.eventOff = true;
    expect(activeEvent(s, DURING)).toBeUndefined();
    expect(convertEndedEvents(s, DURING)[0].candy).toBe(10);
  });

  it('setEventForce reopens after a forced end', () => {
    const g = new Game(0);
    g.state.cheat.eventOff = true;
    g.setEventForce(true);
    expect(g.state.cheat.eventOff).toBe(false);
    expect(g.event()).toBeDefined();
  });

  it('skipTime pays an offline reward', () => {
    const g = new Game(Date.now());
    g.state.assignments.dj = g.state.assignments.dj ?? Object.keys(g.state.cards)[0];
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    const before = g.state.listeners;
    g.skipTime(3_600_000);
    expect(events).toContain('offline-reward');
    expect(g.state.listeners).toBeGreaterThan(before);
    expect(g.state.cheat.used).toBe(true);
  });
});
