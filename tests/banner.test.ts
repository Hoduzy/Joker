import { openGame } from './helpers';
import { readdirSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pityOf, pull, rateTable, type Rng } from '../src/core/gacha';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { BANNERS, isBannerActive, STANDARD_BANNER } from '../src/data/banners';
import { CARDS } from '../src/data/cards';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const banner = BANNERS[0];
const DURING = banner.start + 1000;

describe('limited cards', () => {
  it('every outfit has an image folder', () => {
    for (const c of CARDS.filter((c) => c.outfit)) {
      expect(existsSync(`assets/characters/${c.outfit}/full.png`), c.outfit).toBe(true);
      expect(readdirSync(`assets/characters/${c.outfit}`)).toEqual(
        expect.arrayContaining(['sd.png', 'neutral.png', 'smile.png', 'angry.png', 'sad.png', 'surprised.png', 'blush.png']),
      );
    }
  });

  it('never appear in the standard banner', () => {
    const s = createInitialState(0);
    const rng = seeded(5);
    for (let i = 0; i < 3000; i++) {
      for (const r of pull(s, 10, rng)) expect(r.card.limited).toBeUndefined();
    }
  });
});

describe('limited banner', () => {
  it('gives pickups about half of the time for SSR', () => {
    const s = createInitialState(0);
    const rng = seeded(9);
    let ssr = 0;
    let pickup = 0;
    for (let i = 0; i < 100000; i++) {
      s.gacha.bannerPity[banner.id] = 0;
      const [r] = pull(s, 1, rng, DURING, banner.id);
      if (r.card.rarity === 'SSR') {
        ssr++;
        if (r.pickup) {
          pickup++;
          expect(banner.pickups).toContain(r.card.id);
        }
      }
    }
    expect(ssr / 100000).toBeCloseTo(0.03, 2);
    expect(pickup / ssr).toBeGreaterThan(0.44);
    expect(pickup / ssr).toBeLessThan(0.56);
  });

  it('pity guarantees a pickup SSR and is separate from the standard pity', () => {
    const s = createInitialState(0);
    s.gacha.pity = 40;
    const results = pull(s, 80, () => 0.99, DURING, banner.id);
    const last = results[79];
    expect(last.card.rarity).toBe('SSR');
    expect(last.pickup).toBe(true);
    expect(banner.pickups).toContain(last.card.id);
    expect(pityOf(s, banner.id)).toBe(0);
    expect(s.gacha.pity).toBe(40);
  });

  it('rate table adds up to 100%', () => {
    const total = rateTable(banner.id).reduce((sum, r) => sum + r.perPickup * r.pickups.length + r.perCard * r.cards.length, 0);
    expect(total).toBeCloseTo(1);
    expect(rateTable(STANDARD_BANNER).every((r) => r.pickups.length === 0)).toBe(true);
  });

  it('only runs during its period', () => {
    expect(isBannerActive(banner, banner.start - 1)).toBe(false);
    expect(isBannerActive(banner, DURING)).toBe(true);
    expect(isBannerActive(banner, banner.end + 1)).toBe(false);
    const g = openGame();
    g.state.stones = 99999;
    const open = isBannerActive(banner, Date.now());
    expect(g.pull(1, undefined, banner.id) !== null).toBe(open);
    expect(g.pull(1, undefined, 'no-such-banner')).toBeNull();
  });
});

describe('save migration v5 → v6', () => {
  it('adds per-banner pity and keeps the standard pity', () => {
    const s = migrate({ version: 5, gacha: { pity: 33, totalPulls: 50 }, cards: { 'haneul-r': { level: 3 } } }, 0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.gacha).toEqual({ pity: 33, bannerPity: {}, totalPulls: 50 });
    expect(s.cards['haneul-r'].level).toBe(3);
  });

  it('clamps banner pity', () => {
    const s = migrate({ version: 6, gacha: { pity: 1, bannerPity: { [banner.id]: 999, x: -4 } } }, 0);
    expect(s.gacha.bannerPity).toEqual({ [banner.id]: 79, x: 0 });
  });
});
