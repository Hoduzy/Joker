import { describe, expect, it } from 'vitest';
import { BASE_PROGRESS, cardStats, listenersPerSecond, slotPower, totalPower, towerUpgradeCost } from '../src/core/economy';
import { calcOfflineReward } from '../src/core/offline';
import { milestoneThreshold, newMilestones } from '../src/core/rewards';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { CARDS, getCard } from '../src/data/cards';
import { SLOTS } from '../src/data/slots';
import { formatNumber } from '../src/utils/format';

const HOUR = 60 * 60 * 1000;
const dj = SLOTS.find((s) => s.id === 'dj')!;
const guest = SLOTS.find((s) => s.id === 'guest')!;

function withLineup() {
  const s = createInitialState(0);
  s.totalListeners = 1e9; // 네 자리 모두 열린 상태
  s.assignments = { dj: 'haneul-r', engineer: 'mirae-r', writer: 'seoyun-r', guest: 'yuri-r' };
  return s;
}

describe('cards.json', () => {
  it('has permanent R, SR and SSR for every member', () => {
    for (const member of ['haneul', 'mirae', 'seoyun', 'yuri', 'dahye']) {
      expect(CARDS.filter((c) => c.member === member && !c.limited).map((c) => c.rarity).sort()).toEqual(['R', 'SR', 'SSR']);
    }
  });
});

describe('economy', () => {
  it('produces nothing with an empty lineup', () => {
    expect(listenersPerSecond(createInitialState(0))).toBe(0);
  });

  it('applies the slot bonus only in the card\'s own slot', () => {
    const card = getCard('haneul-r')!; // 담당: DJ
    const base = 32 + (8 + 14 + 22) * 0.2;
    expect(slotPower(card, BASE_PROGRESS, dj)).toBeCloseTo(base * (1 + BALANCE.slotBonus));
    expect(slotPower(card, BASE_PROGRESS, guest)).toBeCloseTo(22 + (32 + 8 + 14) * 0.2);
  });

  it('raises stats with limit break', () => {
    const card = getCard('haneul-ssr')!;
    expect(cardStats(card, { limitBreak: 5, level: 1 }).voice).toBe(Math.round(60 * (1 + 5 * BALANCE.limitBreak.statBonusPerLevel)));
  });

  it('applies the full lineup bonus only when every slot is filled', () => {
    const s = withLineup();
    const full = totalPower(s);
    s.assignments.guest = null;
    expect(full).toBeGreaterThan(totalPower(s) * BALANCE.fullLineupBonus);
  });

  it('scales production and cost with tower level', () => {
    const s = withLineup();
    const lv1 = listenersPerSecond(s);
    s.towerLevel = 2;
    expect(listenersPerSecond(s)).toBeCloseTo(lv1 * BALANCE.tower.outputGrowth);
    expect(towerUpgradeCost(2)).toBeGreaterThan(towerUpgradeCost(1));
  });
});

describe('offline reward', () => {
  it('pays for elapsed time and caps at 12 hours', () => {
    const s = withLineup();
    expect(calcOfflineReward(s, HOUR).earned).toBeCloseTo(listenersPerSecond(s) * 3600);
    const r = calcOfflineReward(s, 30 * HOUR);
    expect(r.elapsedMs).toBe(12 * HOUR);
    expect(r.earned).toBeCloseTo(listenersPerSecond(s) * 12 * 3600);
  });

  it('ignores clocks moving backwards', () => {
    const s = withLineup();
    s.lastTick = HOUR;
    expect(calcOfflineReward(s, 0).earned).toBe(0);
  });
});

describe('milestones', () => {
  it('follows 100, 300, 1000, 3000 ...', () => {
    expect([0, 1, 2, 3, 4].map(milestoneThreshold)).toEqual([100, 300, 1000, 3000, 10000]);
  });

  it('returns every newly passed milestone', () => {
    expect(newMilestones(0, 99)).toEqual([]);
    expect(newMilestones(0, 1500).map((m) => m.threshold)).toEqual([100, 300, 1000]);
    expect(newMilestones(3, 1500)).toEqual([]);
  });
});

describe('save migration', () => {
  it('converts a v1 save (members) to v2 (cards) without losing progress', () => {
    const v1 = {
      version: 1,
      listeners: 1234,
      totalListeners: 5678,
      towerLevel: 4,
      assignments: { dj: 'haneul', engineer: 'mirae', writer: null, guest: 'yuri' },
      ownedMembers: ['haneul', 'mirae', 'seoyun', 'yuri', 'dahye'],
      lastTick: 1000,
    };
    const s = migrate(v1, 2000);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.listeners).toBe(1234);
    expect(s.totalListeners).toBe(5678);
    expect(s.towerLevel).toBe(4);
    expect(s.lastTick).toBe(1000);
    expect(Object.keys(s.cards).sort()).toEqual(['dahye-r', 'haneul-r', 'mirae-r', 'seoyun-r', 'yuri-r']);
    expect(s.assignments).toEqual({ dj: 'haneul-r', engineer: 'mirae-r', writer: null, guest: 'yuri-r' });
    expect(s.stones).toBe(BALANCE.stones.welcomeGift);
    expect(s.gacha).toEqual({ pity: 0, bannerPity: {}, totalPulls: 0 });
  });

  it('treats a save without a version as v1', () => {
    const s = migrate({ listeners: 10, ownedMembers: ['haneul'], assignments: { dj: 'haneul' } }, 0);
    expect(s.assignments.dj).toBe('haneul-r');
  });

  it('cleans up invalid v2 data', () => {
    const s = migrate(
      {
        version: 2,
        stones: -5,
        cards: { 'haneul-ssr': { limitBreak: 9 }, 'haneul-r': { limitBreak: 0 }, 'deleted-card': { limitBreak: 1 } },
        // 같은 부원 두 장 동시 배치, 없는 카드 배치
        assignments: { dj: 'haneul-ssr', guest: 'haneul-r', writer: 'seoyun-r' },
        gacha: { pity: 500 },
      },
      0,
    );
    expect(s.stones).toBe(0);
    expect(s.cards['haneul-ssr'].limitBreak).toBe(BALANCE.limitBreak.max);
    expect(s.cards['deleted-card']).toBeUndefined();
    expect(s.assignments).toEqual({ dj: 'haneul-ssr', engineer: null, writer: null, guest: null });
    expect(s.gacha.pity).toBe(BALANCE.gacha.pity - 1);
  });

  it('gives starter cards when nothing usable is owned', () => {
    expect(Object.keys(migrate({ version: 2, cards: {} }, 0).cards)).toHaveLength(5);
  });
});

describe('formatNumber', () => {
  it('uses Korean units', () => {
    expect(formatNumber(9999)).toBe('9,999');
    expect(formatNumber(12345)).toBe('1.23만');
    expect(formatNumber(1_000_000)).toBe('100만');
    expect(formatNumber(750_000)).toBe('75만');
    expect(formatNumber(2_0000_0000)).toBe('2억');
  });
});
