import { describe, expect, it } from 'vitest';
import { isBossStage, rivalFor, rivalHp, stageReward, BOSSES, RIVALS } from '../src/core/dungeon';
import { cardStats, enhanceCost, listenersPerSecond, maxCardLevel } from '../src/core/economy';
import { Game } from '../src/core/game';
import { migrate } from '../src/core/save';
import { SAVE_VERSION } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { getCard } from '../src/data/cards';

describe('card enhancement', () => {
  it('raises stats per level', () => {
    const card = getCard('haneul-r')!;
    expect(cardStats(card, { limitBreak: 0, level: 11 }).voice).toBe(Math.round(32 * (1 + 10 * BALANCE.enhance.statPerLevel)));
  });

  it('caps level by limit break', () => {
    expect(maxCardLevel(0)).toBe(20);
    expect(maxCardLevel(5)).toBe(40);
  });

  it('costs more each level and by rarity', () => {
    const r = getCard('haneul-r')!;
    const ssr = getCard('haneul-ssr')!;
    expect(enhanceCost(r, 2)).toBeGreaterThan(enhanceCost(r, 1));
    expect(enhanceCost(ssr, 1)).toBeGreaterThan(enhanceCost(r, 1));
  });

  it('spends listeners, raises production, and stops at the cap', () => {
    const g = new Game();
    g.state.assignments.dj = 'haneul-r';
    const before = listenersPerSecond(g.state);
    g.state.listeners = 1e12;
    g.state.kits = 1e6;
    expect(g.enhance('haneul-r')).toBe('success');
    expect(g.state.cards['haneul-r'].level).toBe(2);
    expect(listenersPerSecond(g.state)).toBeGreaterThan(before);
    while (g.enhance('haneul-r'));
    expect(g.state.cards['haneul-r'].level).toBe(maxCardLevel(0));
    expect(g.enhanceCost('haneul-r')).toBeNull();
  });

  it('refuses when listeners are short', () => {
    const g = new Game();
    g.state.listeners = 0;
    expect(g.enhance('haneul-r')).toBeNull();
    expect(g.enhance('not-owned')).toBeNull();
  });
});

describe('rival dungeon', () => {
  it('has a boss every 5 stages', () => {
    expect([1, 4, 5, 10].map(isBossStage)).toEqual([false, false, true, true]);
    expect(BOSSES.map((b) => b.id)).toContain(rivalFor(5).id);
    expect(RIVALS.map((r) => r.id)).toContain(rivalFor(6).id);
  });

  it('cycles through every normal rival before repeating', () => {
    const normal = Array.from({ length: 40 }, (_, i) => i + 1).filter((s) => !isBossStage(s)).slice(0, RIVALS.length);
    expect(new Set(normal.map((s) => rivalFor(s).id)).size).toBe(RIVALS.length);
  });

  it('grows HP and makes bosses tougher', () => {
    expect(rivalHp(1)).toBe(BALANCE.dungeon.hpBase);
    expect(rivalHp(2)).toBeGreaterThan(rivalHp(1));
    expect(rivalHp(5)).toBeGreaterThan(rivalHp(6) / BALANCE.dungeon.hpGrowth);
    expect(stageReward(5).tickets).toBe(BALANCE.dungeon.bossTickets);
    expect(stageReward(4).tickets).toBe(BALANCE.dungeon.tickets);
    expect(stageReward(4).kits).toBe(BALANCE.dungeon.kits);
  });

  it('pays first-clear rewards once and advances', () => {
    const g = new Game();
    g.state.stones = 0;
    const r = g.winStage(1)!;
    expect(r.stones).toBe(stageReward(1).stones);
    expect(g.state.stones).toBe(r.stones);
    expect(g.state.dungeon.stage).toBe(2);
    expect(g.winStage(1)).toBeNull();
    g.state.dungeon.stage = 5;
    const tickets = g.state.box.tickets;
    g.winStage(5);
    expect(g.state.box.tickets).toBe(tickets + BALANCE.dungeon.bossTickets);
  });
});

describe('save migration v4 → v5', () => {
  it('adds card levels and dungeon progress', () => {
    const s = migrate({ version: 4, cards: { 'haneul-ssr': { limitBreak: 3 }, 'mirae-r': {} }, stones: 9 }, 0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.cards['haneul-ssr']).toMatchObject({ limitBreak: 3, level: 1 });
    expect(s.dungeon.stage).toBe(1);
    expect(s.stones).toBe(9);
  });

  it('clamps levels above the cap', () => {
    const s = migrate({ version: 5, cards: { 'haneul-r': { limitBreak: 0, level: 99 } }, dungeon: { stage: 7 } }, 0);
    expect(s.cards['haneul-r'].level).toBe(maxCardLevel(0));
    expect(s.dungeon.stage).toBe(7);
  });
});
