import { describe, expect, it } from 'vitest';
import {
  boxRates,
  equipBonuses,
  itemPower,
  maxBoxLevel,
  regenTickets,
  rollEquip,
  rollGrade,
  salvageReward,
  shouldAutoStop,
  ticketCost,
  type EquipItem,
} from '../src/core/equipment';
import { listenersPerSecond } from '../src/core/economy';
import type { Rng } from '../src/core/gacha';
import { Game } from '../src/core/game';
import { migrate } from '../src/core/save';
import { createInitialState, SAVE_VERSION } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { GRADES, PARTS, getGrade } from '../src/data/equipment';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60 * 1000;
const item = (over: Partial<EquipItem> = {}): EquipItem => ({ uid: 1, item: 'mic-school', grade: 'common', main: 5, subs: [], boxLevel: 1, ...over });

describe('equipment data', () => {
  it('has 6 parts and 6 grades', () => {
    expect(PARTS.map((p) => p.name)).toEqual(['마이크', '헤드폰', '믹서', '조명', '의자', '응원봉']);
    expect(GRADES.map((g) => g.name)).toEqual(['일반', '고급', '희귀', '영웅', '전설', '신화']);
  });

  it('box rate rows match the grade count and sum to 100', () => {
    for (let lv = 1; lv <= maxBoxLevel(); lv++) {
      const row = boxRates(lv);
      expect(row).toHaveLength(GRADES.length);
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    }
  });

  it('higher box levels give better grades', () => {
    const avgRank = (lv: number) => {
      const rng = seeded(lv);
      let sum = 0;
      for (let i = 0; i < 20000; i++) sum += GRADES.findIndex((g) => g.id === rollGrade(lv, rng));
      return sum / 20000;
    };
    expect(avgRank(10)).toBeGreaterThan(avgRank(5));
    expect(avgRank(5)).toBeGreaterThan(avgRank(1));
  });

  it('matches level 1 rates', () => {
    const rng = seeded(3);
    const counts: Record<string, number> = {};
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const g = rollGrade(1, rng);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    expect(counts.common / N).toBeCloseTo(0.7, 1);
    expect(counts.uncommon / N).toBeCloseTo(0.25, 1);
    expect(counts.mythic ?? 0).toBe(0);
  });
});

describe('rollEquip', () => {
  it('gives sub-option counts within the grade range, without duplicates', () => {
    const rng = seeded(11);
    for (let i = 0; i < 3000; i++) {
      const e = rollEquip(10, rng, i);
      const g = getGrade(e.grade)!;
      expect(e.subs.length).toBeGreaterThanOrEqual(g.subCount[0]);
      expect(e.subs.length).toBeLessThanOrEqual(g.subCount[1]);
      expect(new Set(e.subs.map((s) => s.id)).size).toBe(e.subs.length);
      expect(e.main).toBeGreaterThan(0);
    }
  });
});

describe('power, salvage, auto stop', () => {
  it('power counts main stat and sub options', () => {
    expect(itemPower(item({ main: 5 }))).toBe(5 * BALANCE.box.powerPerStat);
    expect(itemPower(item({ main: 5, subs: [{ id: 'listenersPct', value: 2 }] }))).toBe(50 + 2 * 30);
    expect(itemPower(null)).toBe(0);
  });

  it('salvage scales with grade and salvage bonus', () => {
    expect(salvageReward(item({ grade: 'common' }))).toEqual({ stones: 1, parts: 1 });
    expect(salvageReward(item({ grade: 'mythic' }), 50)).toEqual({ stones: 120, parts: 48 });
  });

  it('stops on grade or on upgrade', () => {
    const weak = item({ main: 3 });
    const strong = item({ main: 30 });
    expect(shouldAutoStop(item({ grade: 'epic' }), strong, { minGrade: 'epic', stopOnUpgrade: false })).toBe(true);
    expect(shouldAutoStop(item({ grade: 'rare', main: 1 }), strong, { minGrade: 'epic', stopOnUpgrade: true })).toBe(false);
    expect(shouldAutoStop(strong, weak, { minGrade: null, stopOnUpgrade: true })).toBe(true);
    expect(shouldAutoStop(weak, null, { minGrade: null, stopOnUpgrade: true })).toBe(true); // 빈 칸이면 무조건 상승
    expect(shouldAutoStop(weak, strong, { minGrade: null, stopOnUpgrade: false })).toBe(false);
  });
});

describe('tickets', () => {
  it('regenerates one per minute up to 50', () => {
    const s = createInitialState(0);
    s.box.tickets = 0;
    regenTickets(s, 2.5 * MIN);
    expect(s.box.tickets).toBe(2);
    regenTickets(s, 3 * MIN);
    expect(s.box.tickets).toBe(3); // 남은 30초가 이어진다
    regenTickets(s, 999 * MIN);
    expect(s.box.tickets).toBe(BALANCE.tickets.max);
  });

  it('keeps bought tickets above the cap', () => {
    const s = createInitialState(0);
    s.box.tickets = 60;
    regenTickets(s, 100 * MIN);
    expect(s.box.tickets).toBe(60);
  });

  it('charges faster with the ticket regen option', () => {
    const s = createInitialState(0);
    s.box.tickets = 0;
    s.equipment.chair = item({ item: 'chair-gaming', subs: [{ id: 'ticketRegenPct', value: 100 }] });
    regenTickets(s, 2 * MIN);
    expect(s.box.tickets).toBe(4);
  });

  it('ticket price follows tower level', () => {
    expect(ticketCost(1)).toBe(BALANCE.tickets.buyBase);
    expect(ticketCost(5)).toBeGreaterThan(ticketCost(4));
  });
});

describe('Game box flow', () => {
  it('opens, equips, and salvages the replaced item', () => {
    const g = new Game();
    g.state.stones = 0;
    const first = g.openBox(seeded(1))!;
    expect(first).not.toBeNull();
    expect(g.state.box.tickets).toBe(BALANCE.tickets.start - 1);
    expect(g.openBox()).toBeNull(); // 고르기 전에는 못 연다
    expect(g.equipPending()).toEqual({ stones: 0, parts: 0 }); // 빈 칸에 장착: 분해 없음
    const part = PARTS.find((p) => g.state.equipment[p.id])!.id;
    expect(g.state.equipment[part]).toEqual(first);

    // 같은 부위 장비로 교체하면 기존 장비가 분해된다
    const next = { ...first, uid: 99, main: first.main + 10 };
    g.state.box.pending = next;
    const reward = g.equipPending();
    expect(g.state.equipment[part]).toEqual(next);
    expect(reward).toEqual(salvageReward(first));
    expect(g.state.box.parts).toBe(reward.parts);
    expect(g.state.stones).toBe(reward.stones);

    // 분해
    g.openBox(seeded(2));
    const pending = g.state.box.pending!;
    const r2 = g.salvagePending();
    expect(r2).toEqual(salvageReward(pending));
    expect(g.state.box.pending).toBeNull();
  });

  it('levels up the box with parts and unlocks auto open at 5', () => {
    const g = new Game();
    g.state.box.parts = 1000;
    expect(g.autoUnlocked).toBe(false);
    for (let i = 0; i < 4; i++) expect(g.levelUpBox()).toBe(true);
    expect(g.state.box.level).toBe(5);
    expect(g.autoUnlocked).toBe(true);
    expect(g.state.box.parts).toBe(1000 - (20 + 40 + 70 + 110));
  });

  it('buys tickets with listeners', () => {
    const g = new Game();
    g.state.listeners = g.ticketCost * 10;
    expect(g.buyTickets(10)).toBe(true);
    expect(g.state.box.tickets).toBe(BALANCE.tickets.start + 10);
    expect(g.buyTickets(1)).toBe(false);
  });

  it('equipment raises production', () => {
    const s = createInitialState(0);
    s.assignments = { dj: 'haneul-r', engineer: 'mirae-r', writer: 'seoyun-r', guest: 'yuri-r' };
    const before = listenersPerSecond(s);
    s.equipment.mic = item({ main: 20 });
    const withStat = listenersPerSecond(s);
    expect(withStat).toBeGreaterThan(before);
    s.equipment.light = item({ item: 'light-ring', main: 1, subs: [{ id: 'listenersPct', value: 10 }] });
    expect(equipBonuses(s).listenersPct).toBe(10);
    expect(listenersPerSecond(s)).toBeGreaterThan(withStat * 1.09);
  });
});

describe('save migration v2 → v3', () => {
  it('keeps v2 progress and adds box + equipment', () => {
    const s = migrate(
      { version: 2, listeners: 500, stones: 900, towerLevel: 3, cards: { 'haneul-ssr': { limitBreak: 2 } }, assignments: { dj: 'haneul-ssr' }, gacha: { pity: 33, totalPulls: 40 }, lastTick: 100 },
      1000,
    );
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.stones).toBe(900);
    expect(s.cards['haneul-ssr'].limitBreak).toBe(2);
    expect(s.gacha.pity).toBe(33);
    expect(s.box.tickets).toBe(BALANCE.tickets.start);
    expect(s.box.level).toBe(1);
    expect(Object.values(s.equipment).every((e) => e === null)).toBe(true);
  });

  it('migrates v1 all the way to v3', () => {
    const s = migrate({ version: 1, ownedMembers: ['haneul'], assignments: { dj: 'haneul' }, towerLevel: 2 }, 0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.assignments.dj).toBe('haneul-r');
    expect(s.box.tickets).toBe(BALANCE.tickets.start);
  });

  it('drops broken equipment and keeps valid ones', () => {
    const s = migrate(
      {
        version: 3,
        equipment: {
          mic: { uid: 7, item: 'mic-school', grade: 'rare', main: 12, subs: [{ id: 'listenersPct', value: 2 }, { id: 'bogus', value: 1 }] },
          chair: { uid: 8, item: 'mic-school', grade: 'rare', main: 12, subs: [] }, // 부위 불일치
          mixer: { uid: 9, item: 'deleted-item', grade: 'rare', main: 3, subs: [] },
        },
        box: { level: 99, tickets: -3, pending: { uid: 12, item: 'hp-cat', grade: 'epic', main: 9, subs: [] }, auto: { minGrade: 'nope' } },
        nextUid: 2,
      },
      0,
    );
    expect(s.equipment.mic?.subs).toEqual([{ id: 'listenersPct', value: 2 }]);
    expect(s.equipment.chair).toBeNull();
    expect(s.equipment.mixer).toBeNull();
    expect(s.box.level).toBe(maxBoxLevel());
    expect(s.box.tickets).toBe(0);
    expect(s.box.pending?.item).toBe('hp-cat');
    expect(s.box.auto.minGrade).toBe('epic');
    expect(s.nextUid).toBe(13);
  });
});
