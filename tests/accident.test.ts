import { describe, expect, it } from 'vitest';
import { gradeAccident, gradeBoost, isLocked, maxOffset, miraeOnEngineer, rollAccident, signalStrength, tuneHint, unstableChance } from '../src/core/accident';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { BALANCE } from '../src/data/balance';

const A = BALANCE.accident;

/** 시드 고정 난수 */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

describe('accident setup', () => {
  it('starts 0.5~3.0 MHz off the broadcast frequency at tower Lv.1, never unstable', () => {
    const s = createInitialState(0);
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const a = rollAccident(s, rng);
      const off = Math.abs(a.start - a.target);
      expect(off).toBeGreaterThanOrEqual(A.offsetMin - 0.051);
      expect(off).toBeLessThanOrEqual(A.offsetMax + 0.051);
      expect(a.unstable).toBe(false);
      expect(a.timeLimitMs).toBe(A.timeLimitMs);
    }
  });

  it('higher tower level: wider offset and unstable signals', () => {
    expect(maxOffset(1)).toBe(A.offsetMax);
    expect(maxOffset(20)).toBeGreaterThan(A.offsetMax);
    expect(maxOffset(999)).toBe(A.offsetCap);
    expect(unstableChance(1)).toBe(0);
    expect(unstableChance(10)).toBeGreaterThan(0);
    expect(unstableChance(999)).toBe(A.unstableMax);
  });

  it('Mirae on the engineer slot gives +3s and hints', () => {
    const s = createInitialState(0);
    s.cards['mirae-r'] = { limitBreak: 0, level: 1, obtainedAt: 0 };
    expect(miraeOnEngineer(s)).toBe(false);
    s.assignments.engineer = 'mirae-r';
    expect(miraeOnEngineer(s)).toBe(true);
    const a = rollAccident(s);
    expect(a.miraeHelps).toBe(true);
    expect(a.timeLimitMs).toBe(A.timeLimitMs + A.miraeBonusMs);
  });
});

describe('signal & grading', () => {
  it('signal grows toward the target; green within tolerance', () => {
    expect(signalStrength(A.frequency, A.frequency)).toBe(1);
    expect(signalStrength(A.frequency + 0.5, A.frequency)).toBeGreaterThan(signalStrength(A.frequency + 1, A.frequency));
    expect(signalStrength(A.frequency + 3, A.frequency)).toBe(0);
    expect(isLocked(89.8, 89.7)).toBe(true);
    expect(isLocked(89.9, 89.7)).toBe(false);
  });

  it('grades by when the signal was caught: 3s perfect, 6s good, limit barely, else fail', () => {
    expect(gradeAccident(2500, 10000)).toBe('perfect');
    expect(gradeAccident(5000, 10000)).toBe('good');
    expect(gradeAccident(9000, 10000)).toBe('barely');
    expect(gradeAccident(12000, 13000)).toBe('barely');
    expect(gradeAccident(null, 10000)).toBe('fail');
    expect(gradeBoost('perfect')).toEqual({ multiplier: 3, durationMs: 30000 });
    expect(gradeBoost('good')?.multiplier).toBe(2);
    expect(gradeBoost('barely')).toBeNull();
    expect(gradeBoost('fail')).toEqual({ multiplier: 0.5, durationMs: 20000 });
  });

  it('hints point the right way', () => {
    expect(tuneHint(87, 89.7)).toBe('far-right');
    expect(tuneHint(89.3, 89.7)).toBe('right');
    expect(tuneHint(92, 89.7)).toBe('far-left');
    expect(tuneHint(90, 89.7)).toBe('left');
    expect(tuneHint(89.7, 89.7)).toBe('hold');
  });
});

describe('save v11 → v12', () => {
  it('adds records', () => {
    const old = { ...JSON.parse(JSON.stringify(createInitialState(0))), version: 11 } as Record<string, unknown>;
    delete old.records;
    const s = migrate(old, 1000);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.records).toEqual({ accidentsFixed: 0, perfectFixes: 0, accidentsFailed: 0 });
  });
});
