import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { grantCard, pull, rateTable, type Rng } from '../src/core/gacha';
import { createInitialState } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { getCard } from '../src/data/cards';

/** 시드 고정 난수 (mulberry32) */
function seeded(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('gacha rates', () => {
  it('matches R 79% / SR 18% / SSR 3% over many single pulls (pity excluded)', () => {
    const s = createInitialState(0);
    const rng = seeded(42);
    const counts = { R: 0, SR: 0, SSR: 0, U: 0 };
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      s.gacha.pity = 0; // 천장 영향 제거
      counts[pull(s, 1, rng)[0].card.rarity]++;
    }
    expect(counts.R / N).toBeCloseTo(0.79, 2);
    expect(counts.SR / N).toBeCloseTo(0.18, 2);
    expect(counts.SSR / N).toBeCloseTo(0.03, 2);
    // U는 상시 모집에서 절대 나오지 않는다
    expect(counts.U).toBe(0);
  });

  it('rate table sums to 100%', () => {
    const total = rateTable().reduce((sum, r) => sum + r.perCard * r.cards.length, 0);
    expect(total).toBeCloseTo(1);
  });
});

describe('pity', () => {
  it('guarantees SSR on the 80th pull without one', () => {
    const s = createInitialState(0);
    const alwaysR: Rng = () => 0.99;
    const results = pull(s, 80, alwaysR);
    expect(results.slice(0, 79).every((r) => r.card.rarity !== 'SSR')).toBe(true);
    expect(results[79].card.rarity).toBe('SSR');
    expect(results[79].byPity).toBe(true);
    expect(s.gacha.pity).toBe(0);
  });

  it('resets the counter when SSR comes naturally', () => {
    const s = createInitialState(0);
    s.gacha.pity = 50;
    pull(s, 1, () => 0); // 0 → SSR
    expect(s.gacha.pity).toBe(0);
  });

  it('carries over between sessions of pulls', () => {
    const s = createInitialState(0);
    s.gacha.pity = 75;
    const results = pull(s, 10, () => 0.99);
    expect(results.findIndex((r) => r.card.rarity === 'SSR')).toBe(4); // 76,77,78,79번째 다음 80번째
  });
});

describe('10-pull guarantee', () => {
  it('turns the 10th card into SR when the first nine are all R', () => {
    const s = createInitialState(0);
    const results = pull(s, 10, () => 0.99);
    expect(results.slice(0, 9).every((r) => r.card.rarity === 'R')).toBe(true);
    expect(results[9].card.rarity).toBe('SR');
  });

  it('always contains SR or better', () => {
    const rng = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const s = createInitialState(0);
      expect(pull(s, 10, rng).some((r) => r.card.rarity !== 'R')).toBe(true);
    }
  });
});

describe('duplicates', () => {
  it('raises limit break up to 5, then refunds stones', () => {
    const s = createInitialState(0);
    s.stones = 0;
    const card = getCard('haneul-ssr')!;
    expect(grantCard(s, card).isNew).toBe(true);
    for (let i = 1; i <= 5; i++) expect(grantCard(s, card).limitBreak).toBe(i);
    const over = grantCard(s, card);
    expect(over.limitBreak).toBe(5);
    expect(over.refund).toBe(BALANCE.limitBreak.overflowRefund.SSR);
    expect(s.stones).toBe(BALANCE.limitBreak.overflowRefund.SSR);
  });
});

describe('Game.pull', () => {
  it('charges stones and refuses when short', () => {
    const g = new Game(0);
    g.state.totalListeners = 1e9;
    g.state.milestonesReached = 99;
    g.state.stones = 1600;
    expect(g.pull(10, seeded(1))).toHaveLength(10);
    expect(g.state.stones).toBe(0); // 첫 10연은 최대 돌파 환원이 생길 수 없다
    g.state.stones = 100;
    expect(g.pull(1)).toBeNull();
    expect(g.state.stones).toBe(100);
  });

  it('keeps one member in only one slot', () => {
    const g = new Game(0);
    g.state.totalListeners = 1e9;
    g.state.milestonesReached = 99;
    g.state.cards['haneul-ssr'] = { limitBreak: 0, level: 1, obtainedAt: 0 };
    g.state.cards['haneul-r'] = { limitBreak: 0, level: 1, obtainedAt: 0 };
    g.assign('dj', 'haneul-r');
    g.assign('guest', 'haneul-ssr');
    expect(g.state.assignments.dj).toBeNull();
    expect(g.state.assignments.guest).toBe('haneul-ssr');
  });

  it('grants stones on tower level up and milestones', () => {
    const g = new Game(0);
    g.state.assignments.dj = null; // 오프라인 생산으로 마일스톤이 먼저 터지지 않게
    g.state.stones = 0;
    g.state.listeners = 1000;
    g.upgradeTower();
    expect(g.state.stones).toBe(BALANCE.stones.towerUpBase + BALANCE.stones.towerUpPerLevel * 2);
    g.state.stones = 0;
    g.state.totalListeners = 350;
    g.advance(g.state.lastTick);
    expect(g.state.milestonesReached).toBe(2);
    expect(g.state.stones).toBe(BALANCE.stones.milestoneBase * 2 + BALANCE.stones.milestonePerStep);
  });
});
