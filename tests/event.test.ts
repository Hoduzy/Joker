import { describe, expect, it } from 'vitest';
import {
  activeEvent,
  buyShopItem,
  claimEventMission,
  convertEndedEvents,
  eventListenerMultiplier,
  eventProgress,
  eventPull,
  rollIdleCandy,
  trackEvent,
} from '../src/core/events';
import { pull, type Rng } from '../src/core/gacha';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { getCard, RARITIES } from '../src/data/cards';
import { EVENTS, getEvent } from '../src/data/events';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ev = getEvent('halloween-2026')!;
const DURING = Date.parse('2026-10-30T12:00:00+09:00');
const AFTER = Date.parse('2026-11-09T00:00:01+09:00');
const BEFORE = Date.parse('2026-10-27T23:59:00+09:00');

describe('events.json', () => {
  it('loads the halloween event with valid U cards and 3 story episodes', () => {
    expect(EVENTS.length).toBeGreaterThan(0);
    expect(ev.cards.map((id) => getCard(id)?.rarity)).toEqual(['U', 'U']);
    expect(ev.story).toHaveLength(3);
    expect(ev.story[0].key).toBe('ev:halloween-2026:1');
  });

  it('runs 2026-10-28 00:00 ~ 2026-11-08 23:59 KST', () => {
    const s = createInitialState(0);
    expect(activeEvent(s, BEFORE)).toBeUndefined();
    expect(activeEvent(s, Date.parse('2026-10-28T00:00:00+09:00'))?.id).toBe(ev.id);
    expect(activeEvent(s, Date.parse('2026-11-08T23:59:00+09:00'))?.id).toBe(ev.id);
    expect(activeEvent(s, AFTER)).toBeUndefined();
  });

  it('force flag opens the event outside its dates', () => {
    const s = createInitialState(0);
    s.events.force = true;
    expect(activeEvent(s, BEFORE)?.id).toBe(ev.id);
  });

  it('rarity order is U > SSR > SR > R', () => {
    expect(RARITIES).toEqual(['U', 'SSR', 'SR', 'R']);
  });
});

describe('event gacha', () => {
  it('rolls about U 2% / SSR 15% and only ever gives this event’s U cards', () => {
    const s = createInitialState(0);
    const rng = seeded(7);
    const p = eventProgress(s, ev.id, DURING);
    const counts = { U: 0, SSR: 0, SR: 0, R: 0 };
    const N = 60_000;
    for (let i = 0; i < N; i++) {
      p.candy = ev.gacha.single;
      p.pity = 0;
      const [r] = eventPull(s, 1, rng, DURING)!;
      counts[r.card.rarity]++;
      if (r.card.rarity === 'U') expect(ev.cards).toContain(r.card.id);
    }
    expect(counts.U / N).toBeCloseTo(0.02, 2);
    expect(counts.SSR / N).toBeCloseTo(0.15, 2);
  });

  it('guarantees a U within 50 pulls and resets the pity', () => {
    const s = createInitialState(0);
    const p = eventProgress(s, ev.id, DURING);
    p.candy = 1e9;
    const never: Rng = () => 0.999; // 항상 R
    let pulls = 0;
    let gotU = false;
    while (!gotU && pulls < 100) {
      gotU = eventPull(s, 1, never, DURING)![0].card.rarity === 'U';
      pulls++;
    }
    expect(pulls).toBe(ev.gacha.pity);
    expect(p.pity).toBe(0);
  });

  it('10-pull guarantees SR or better', () => {
    const s = createInitialState(0);
    const p = eventProgress(s, ev.id, DURING);
    p.candy = ev.gacha.ten;
    const results = eventPull(s, 10, () => 0.999, DURING)!;
    expect(results).toHaveLength(10);
    expect(results.some((r) => r.card.rarity !== 'R')).toBe(true);
    expect(p.candy).toBe(0);
  });

  it('needs candy and the event period', () => {
    const s = createInitialState(0);
    expect(eventPull(s, 1, Math.random, DURING)).toBeNull();
    eventProgress(s, ev.id, DURING).candy = 999;
    expect(eventPull(s, 1, Math.random, AFTER)).toBeNull();
  });

  it('standard gacha never gives U', () => {
    const s = createInitialState(0);
    s.stones = 1e9;
    const rng = seeded(3);
    for (let i = 0; i < 2000; i++) for (const r of pull(s, 10, rng)) expect(r.card.rarity).not.toBe('U');
  });
});

describe('event shop', () => {
  it('a U card costs the same as 50 pity pulls', () => {
    const card = ev.shop.find((s) => s.kind === 'card')!;
    expect(card.price).toBe(ev.gacha.single * ev.gacha.pity);
  });

  it('exchanges a chosen U card and respects limits', () => {
    const s = createInitialState(0);
    const p = eventProgress(s, ev.id, DURING);
    const item = ev.shop.find((x) => x.kind === 'card')!;
    p.candy = item.price * (item.limit + 1);
    expect(buyShopItem(s, item.id, DURING)).toBeNull(); // 카드를 안 고르면 실패
    const r = buyShopItem(s, item.id, DURING, ev.cards[1]);
    expect(r?.card?.card.id).toBe(ev.cards[1]);
    expect(s.cards[ev.cards[1]]).toBeDefined();
    for (let i = 1; i < item.limit; i++) buyShopItem(s, item.id, DURING, ev.cards[0]);
    expect(buyShopItem(s, item.id, DURING, ev.cards[0])).toBeNull();
  });
});

describe('event drops & missions', () => {
  it('idle drop rolls every 5 minutes and caps offline time', () => {
    const s = createInitialState(DURING);
    const p = eventProgress(s, ev.id, DURING);
    expect(rollIdleCandy(s, DURING + 4 * 60000, () => 0)).toBe(0);
    const got = rollIdleCandy(s, DURING + 5 * 60000, () => 0);
    expect(got).toBeGreaterThanOrEqual(ev.drops.idle.min);
    // 이틀 꺼 두어도 offlineCapHours만큼만
    const before = p.candy;
    rollIdleCandy(s, DURING + 2 * 86400000, () => 0);
    const maxRolls = (ev.drops.idle.offlineCapHours * 60) / ev.drops.idle.everyMin;
    expect(p.candy - before).toBeLessThanOrEqual(maxRolls * ev.drops.idle.max);
  });

  it('tracks daily missions and pays candy once', () => {
    const s = createInitialState(0);
    const done = trackEvent(s, 'openBox', 20, DURING);
    expect(done).toContain('daily:box20');
    const before = eventProgress(s, ev.id, DURING).candy;
    expect(claimEventMission(s, 'daily', 'box20', DURING)).not.toBeNull();
    expect(eventProgress(s, ev.id, DURING).candy).toBeGreaterThan(before);
    expect(claimEventMission(s, 'daily', 'box20', DURING)).toBeNull();
  });

  it('does not track outside the event', () => {
    const s = createInitialState(0);
    expect(trackEvent(s, 'openBox', 20, AFTER)).toEqual([]);
  });

  it('U cards boost listeners during the event only', () => {
    const s = createInitialState(0);
    s.assignments.dj = ev.cards[0];
    expect(eventListenerMultiplier(s, DURING)).toBeCloseTo(1 + ev.listenerBonusPct / 100);
    expect(eventListenerMultiplier(s, AFTER)).toBe(1);
  });
});

describe('after the event', () => {
  it('converts leftover candy to stones once', () => {
    const s = createInitialState(0);
    eventProgress(s, ev.id, DURING).candy = 100;
    const stones = s.stones;
    const conv = convertEndedEvents(s, AFTER);
    expect(conv).toHaveLength(1);
    expect(s.stones).toBe(stones + 100 * ev.currency.stonesPerUnit);
    expect(eventProgress(s, ev.id).candy).toBe(0);
    expect(convertEndedEvents(s, AFTER + 1000)).toEqual([]);
  });

  it('does not convert while the event runs', () => {
    const s = createInitialState(0);
    eventProgress(s, ev.id, DURING).candy = 100;
    expect(convertEndedEvents(s, DURING)).toEqual([]);
  });
});

describe('save migration v8 → v9', () => {
  it('adds events and lobbyCard to an old save', () => {
    const old = { ...createInitialState(0), version: 8 } as Record<string, unknown>;
    delete old.events;
    delete old.lobbyCard;
    const s = migrate(old, 1000);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.events).toEqual({ force: false, progress: {} });
    expect(s.lobbyCard).toBeNull();
  });

  it('keeps event progress and drops an unowned lobby card', () => {
    const st = createInitialState(0);
    eventProgress(st, ev.id, DURING).candy = 42;
    st.lobbyCard = 'not-owned';
    const s = migrate(JSON.parse(JSON.stringify(st)), 1000);
    expect(s.events.progress[ev.id].candy).toBe(42);
    expect(s.lobbyCard).toBeNull();
  });
});
