import { openGame } from './helpers';
import { describe, expect, it } from 'vitest';
import { listenersPerSecond } from '../src/core/economy';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { CORNERS, FLAVOR, cornerForDay, dayKey, getCorner } from '../src/data/flavor';
import { MEMBERS } from '../src/data/members';

describe('flavor data', () => {
  it('has 15 bubble lines per member', () => {
    for (const m of MEMBERS) expect(FLAVOR.barks[m.id]).toHaveLength(15);
  });

  it('has chat for every member and corner', () => {
    for (const m of MEMBERS) expect(FLAVOR.members[m.id].length).toBeGreaterThan(0);
    for (const c of CORNERS) expect(c.chat.length).toBeGreaterThan(0);
    expect(FLAVOR.stories.length).toBeGreaterThan(0);
  });
});

describe('today\'s corner', () => {
  it('rotates one step per day and cycles', () => {
    const ids = Array.from({ length: CORNERS.length + 1 }, (_, i) => cornerForDay(dayKey(new Date(2026, 9, 1 + i))).id);
    expect(new Set(ids.slice(0, CORNERS.length)).size).toBe(CORNERS.length);
    expect(ids[CORNERS.length]).toBe(ids[0]);
  });

  it('boosts the corner slot', () => {
    const s = createInitialState(0);
    s.assignments = { dj: 'haneul-r', engineer: null, writer: null, guest: null };
    s.corner = { id: CORNERS.find((c) => c.slot !== 'dj')!.id, day: 'x' };
    const plain = listenersPerSecond(s);
    s.corner = { id: CORNERS.find((c) => c.slot === 'dj')!.id, day: 'x' };
    expect(listenersPerSecond(s)).toBeCloseTo(plain * (1 + BALANCE.cornerBonus));
  });

  it('changes the corner when the date changes', () => {
    const g = openGame();
    g.state.corner = { id: CORNERS[0].id, day: '2000-01-01' };
    g.advance();
    expect(g.state.corner.day).toBe(dayKey(new Date()));
    expect(getCorner(g.state.corner.id)).toBeDefined();
  });
});

function lineupGame() {
  const g = openGame();
  g.state.assignments = { dj: 'haneul-r', engineer: 'mirae-r', writer: 'seoyun-r', guest: 'yuri-r' };
  return g;
}

describe('legend story boost', () => {
  it('triples the rate for 30 seconds', () => {
    const g = lineupGame();
    const now = Date.now();
    const base = g.baseRate;
    g.claimLegend(now);
    expect(g.multiplier(now)).toBe(3);
    expect(g.multiplier(now + BALANCE.legend.durationMs + 1)).toBe(1);
    expect(g.rate).toBeCloseTo(base * 3);
  });

  it('applies the multiplier to online production', () => {
    const g = lineupGame();
    const now = Date.now();
    g.claimLegend(now);
    g.state.lastTick = now;
    g.state.listeners = 0;
    g.advance(now + 1000);
    expect(g.state.listeners).toBeCloseTo(g.baseRate * 3, 0);
  });

  it('comes more often with the equipment option', () => {
    const g = openGame();
    expect(g.legendFrequency()).toBe(1);
    g.state.equipment.mic = { uid: 1, item: 'mic-school', grade: 'epic', main: 1, subs: [{ id: 'legendStoryPct', value: 25 }], boxLevel: 1 };
    expect(g.legendFrequency()).toBe(1.25);
  });
});

describe('broadcast accident', () => {
  it('gives x3 / x2 / nothing by how fast it was fixed, and counts perfect fixes', () => {
    const g = lineupGame();
    const now = Date.now();
    expect(g.resolveAccident('perfect', now)?.multiplier).toBe(3);
    expect(g.multiplier(now)).toBe(3);
    expect(g.multiplier(now + BALANCE.accident.perfect.durationMs + 1)).toBe(1);
    g.resolveAccident('good', now);
    expect(g.multiplier(now)).toBe(2);
    expect(g.resolveAccident('barely', now)).toBeNull();
    expect(g.state.records).toEqual({ accidentsFixed: 3, perfectFixes: 1, accidentsFailed: 0 });
  });

  it('halves production for 20 seconds when missed', () => {
    const g = lineupGame();
    const now = Date.now();
    g.resolveAccident('fail', now);
    expect(g.multiplier(now)).toBe(0.5);
    expect(g.state.records.accidentsFailed).toBe(1);
    expect(g.multiplier(now + BALANCE.accident.penaltyMs + 1)).toBe(1);
  });

  it('stacks with a legend boost', () => {
    const g = lineupGame();
    const now = Date.now();
    g.claimLegend(now);
    g.resolveAccident('fail', now);
    expect(g.multiplier(now)).toBe(1.5);
  });
});

describe('milestone event', () => {
  it('emits one event for several milestones', () => {
    const g = openGame();
    g.state.totalListeners = 0;
    g.state.milestonesReached = 0;
    const events: unknown[] = [];
    g.on((e) => e.type === 'milestone' && events.push(e));
    g.state.totalListeners = 1500;
    g.advance(g.state.lastTick);
    expect(events).toEqual([{ type: 'milestone', threshold: 1000, count: 3, stones: 100 + 160 + 220 }]);
  });
});

describe('save migration v3 → v4', () => {
  it('adds today\'s corner and keeps everything else', () => {
    const s = migrate({ version: 3, stones: 55, box: { level: 4, tickets: 7 }, equipment: {} }, Date.UTC(2026, 9, 24, 12));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.stones).toBe(55);
    expect(s.box.level).toBe(4);
    expect(getCorner(s.corner.id)).toBeDefined();
  });
});
