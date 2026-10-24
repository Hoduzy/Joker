import { describe, expect, it } from 'vitest';
import { listenersPerSecond, towerUpgradeCost, totalPower } from '../src/core/economy';
import { calcOfflineReward } from '../src/core/offline';
import { migrate } from '../src/core/save';
import { createInitialState } from '../src/core/state';
import { BALANCE } from '../src/data/balance';

const HOUR = 60 * 60 * 1000;

describe('economy', () => {
  it('produces nothing with an empty lineup', () => {
    expect(listenersPerSecond(createInitialState(0))).toBe(0);
  });

  it('applies the full lineup bonus only when every slot is filled', () => {
    const s = createInitialState(0);
    s.assignments = { dj: 'haneul', engineer: 'mirae', writer: 'seoyun', guest: null };
    const partial = totalPower(s);
    s.assignments.guest = 'yuri';
    const withGuest = totalPower(s);
    // 유리: 매력 26 + (16+6+9)*0.2 = 32.2
    expect(withGuest).toBeCloseTo((partial + 32.2) * BALANCE.fullLineupBonus);
  });

  it('scales production and cost with tower level', () => {
    const s = createInitialState(0);
    s.assignments.dj = 'haneul';
    const lv1 = listenersPerSecond(s);
    s.towerLevel = 2;
    expect(listenersPerSecond(s)).toBeCloseTo(lv1 * BALANCE.tower.outputGrowth);
    expect(towerUpgradeCost(2)).toBeGreaterThan(towerUpgradeCost(1));
  });
});

describe('offline reward', () => {
  it('pays for elapsed time', () => {
    const s = createInitialState(0);
    s.assignments.dj = 'haneul';
    const r = calcOfflineReward(s, HOUR);
    expect(r.earned).toBeCloseTo(listenersPerSecond(s) * 3600);
  });

  it('caps at 12 hours', () => {
    const s = createInitialState(0);
    s.assignments.dj = 'haneul';
    const r = calcOfflineReward(s, 30 * HOUR);
    expect(r.elapsedMs).toBe(12 * HOUR);
    expect(r.rawElapsedMs).toBe(30 * HOUR);
    expect(r.earned).toBeCloseTo(listenersPerSecond(s) * 12 * 3600);
  });

  it('ignores clocks moving backwards', () => {
    const s = createInitialState(HOUR);
    s.assignments.dj = 'haneul';
    expect(calcOfflineReward(s, 0).earned).toBe(0);
  });
});

describe('save migration', () => {
  it('fills defaults and drops invalid data', () => {
    const s = migrate(
      { listeners: 'x', towerLevel: 3, assignments: { dj: 'haneul', guest: 'haneul', writer: 'nobody' } },
      1000,
    );
    expect(s.listeners).toBe(0);
    expect(s.towerLevel).toBe(3);
    expect(s.assignments).toEqual({ dj: 'haneul', engineer: null, writer: null, guest: null });
    expect(s.ownedMembers.length).toBe(5);
  });
});

describe('formatNumber', () => {
  it('uses Korean units', async () => {
    const { formatNumber } = await import('../src/utils/format');
    expect(formatNumber(9999)).toBe('9,999');
    expect(formatNumber(12345)).toBe('1.23만');
    expect(formatNumber(1_000_000)).toBe('100만');
    expect(formatNumber(1_500_000)).toBe('150만');
    expect(formatNumber(750_000)).toBe('75만');
    expect(formatNumber(2_0000_0000)).toBe('2억');
  });
});
