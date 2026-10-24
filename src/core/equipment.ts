import { BALANCE } from '../data/balance';
import { GRADES, ITEMS, PARTS, SUB_OPTIONS, getGrade, getItemDef, getSubOption, gradeRank, type SubOptionId } from '../data/equipment';
import { STAT_KEYS, type StatKey, type Stats } from '../data/stats';
import type { Rng } from './gacha';
import type { GameState } from './state';

export interface EquipSub {
  id: SubOptionId;
  /** % 값 */
  value: number;
}

/** 실제로 얻은 장비 1개. 수치는 뽑힐 때 정해져 저장된다. */
export interface EquipItem {
  uid: number;
  /** equipment.json items[].id */
  item: string;
  /** equipment.json grades[].id */
  grade: string;
  /** 주 스탯 값 (스탯 종류는 아이템 정의를 따른다) */
  main: number;
  subs: EquipSub[];
  /** 얻었을 때의 택배 레벨 */
  boxLevel: number;
}

export type EquipBonuses = { stats: Stats } & Record<SubOptionId, number>;

const round1 = (v: number) => Math.round(v * 10) / 10;
const randRange = (rng: Rng, [min, max]: [number, number]) => min + (max - min) * rng();
const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export const maxBoxLevel = () => BALANCE.box.partsToNext.length + 1;

export function boxRates(level: number): readonly number[] {
  const rows = BALANCE.box.rates;
  return rows[Math.min(rows.length, Math.max(1, level)) - 1];
}

/** 택배 레벨에 따른 등급 뽑기 */
export function rollGrade(level: number, rng: Rng): string {
  const rates = boxRates(level);
  let r = rng() * 100;
  for (let i = 0; i < GRADES.length; i++) {
    r -= rates[i] ?? 0;
    if (r < 0) return GRADES[i].id;
  }
  // 부동소수 오차 대비: 확률이 0이 아닌 가장 높은 등급
  for (let i = GRADES.length - 1; i >= 0; i--) if ((rates[i] ?? 0) > 0) return GRADES[i].id;
  return GRADES[0].id;
}

/** 장비 1개 생성 */
export function rollEquip(level: number, rng: Rng, uid: number): EquipItem {
  const grade = getGrade(rollGrade(level, rng))!;
  const def = ITEMS[Math.floor(rng() * ITEMS.length)];
  const levelMult = 1 + BALANCE.box.statPerLevel * (level - 1);
  const main = Math.max(1, Math.round(randRange(rng, def.range) * grade.statMult * levelMult));

  const count = randInt(rng, grade.subCount[0], grade.subCount[1]);
  const pool = [...SUB_OPTIONS];
  const subs: EquipSub[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const opt = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    subs.push({ id: opt.id, value: round1(randRange(rng, opt.range) * grade.subMult) });
  }
  return { uid, item: def.id, grade: grade.id, main, subs, boxLevel: level };
}

export function itemPart(item: EquipItem): string {
  return getItemDef(item.item)?.part ?? '';
}

export function itemStat(item: EquipItem): StatKey {
  return getItemDef(item.item)?.stat ?? 'voice';
}

/** 장비 전투력 */
export function itemPower(item: EquipItem | null | undefined): number {
  if (!item) return 0;
  let power = item.main * BALANCE.box.powerPerStat;
  for (const s of item.subs) power += s.value * (getSubOption(s.id)?.power ?? 0);
  return Math.round(power);
}

export function equipmentPower(state: GameState): number {
  return PARTS.reduce((sum, p) => sum + itemPower(state.equipment[p.id]), 0);
}

/** 장착 장비 효과 합계 */
export function equipBonuses(state: GameState): EquipBonuses {
  const stats = {} as Stats;
  for (const k of STAT_KEYS) stats[k] = 0;
  const b = { stats, listenersPct: 0, legendStoryPct: 0, allStatsPct: 0, offlinePct: 0, salvagePct: 0, ticketRegenPct: 0 } as EquipBonuses;
  for (const p of PARTS) {
    const it = state.equipment[p.id];
    if (!it) continue;
    stats[itemStat(it)] += it.main;
    for (const s of it.subs) b[s.id] = round1(b[s.id] + s.value);
  }
  return b;
}

/** 분해 보상 */
export function salvageReward(item: EquipItem, salvagePct = 0): { stones: number; parts: number } {
  const g = getGrade(item.grade);
  const mult = 1 + salvagePct / 100;
  return { stones: Math.round((g?.salvage.stones ?? 0) * mult), parts: Math.round((g?.salvage.parts ?? 0) * mult) };
}

export interface AutoSettings {
  /** 이 등급 이상이면 멈춤 (null이면 등급 조건 없음) */
  minGrade: string | null;
  /** 전투력이 오르는 장비면 멈춤 */
  stopOnUpgrade: boolean;
}

/** 자동 개봉 중 이 장비에서 멈춰야 하는지 */
export function shouldAutoStop(item: EquipItem, equipped: EquipItem | null | undefined, settings: AutoSettings): boolean {
  if (settings.minGrade && gradeRank(item.grade) >= gradeRank(settings.minGrade)) return true;
  if (settings.stopOnUpgrade && itemPower(item) > itemPower(equipped)) return true;
  return false;
}

/** 티켓 1장 충전 시간 (충전 속도 옵션 반영) */
export function ticketInterval(state: GameState): number {
  return BALANCE.tickets.regenMs / (1 + equipBonuses(state).ticketRegenPct / 100);
}

/**
 * 시간이 흐른 만큼 티켓을 충전한다. 최대치(50) 이상이면 충전이 멈추고,
 * 구매로 최대치를 넘긴 티켓은 그대로 둔다.
 */
export function regenTickets(state: GameState, now: number): void {
  const box = state.box;
  const interval = ticketInterval(state);
  if (box.tickets >= BALANCE.tickets.max) {
    box.ticketClock = now;
    return;
  }
  const elapsed = Math.max(0, now - box.ticketClock);
  const gained = Math.floor(elapsed / interval);
  if (gained <= 0) return;
  box.tickets = Math.min(BALANCE.tickets.max, box.tickets + gained);
  box.ticketClock = box.tickets >= BALANCE.tickets.max ? now : box.ticketClock + gained * interval;
}

/** 다음 티켓까지 남은 시간(ms). 가득 찼으면 0 */
export function msToNextTicket(state: GameState, now: number): number {
  if (state.box.tickets >= BALANCE.tickets.max) return 0;
  return Math.max(0, ticketInterval(state) - (now - state.box.ticketClock));
}

export function ticketCost(towerLevel: number): number {
  return Math.ceil(BALANCE.tickets.buyBase * Math.pow(BALANCE.tickets.buyGrowth, towerLevel - 1));
}

/** 비교 팝업용: 두 장비의 항목별 값 (주 스탯 + 부가옵션 합집합) */
export interface CompareRow {
  key: string;
  label: string;
  unit: string;
  before: number;
  after: number;
}

export function compareRows(next: EquipItem, current: EquipItem | null | undefined, statLabels: Record<StatKey, string>): CompareRow[] {
  const rows: CompareRow[] = [];
  const stats = new Set<StatKey>([itemStat(next), ...(current ? [itemStat(current)] : [])]);
  for (const k of STAT_KEYS) {
    if (!stats.has(k)) continue;
    rows.push({
      key: k,
      label: statLabels[k],
      unit: '',
      before: current && itemStat(current) === k ? current.main : 0,
      after: itemStat(next) === k ? next.main : 0,
    });
  }
  for (const opt of SUB_OPTIONS) {
    const before = current?.subs.find((s) => s.id === opt.id)?.value ?? 0;
    const after = next.subs.find((s) => s.id === opt.id)?.value ?? 0;
    if (before || after) rows.push({ key: opt.id, label: opt.name, unit: '%', before, after });
  }
  return rows;
}
