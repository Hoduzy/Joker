/**
 * 협찬 택배 장비 정의. 실제 데이터는 equipment.json에 있다.
 *
 * - parts:      부위 (id, 이름, 아이콘 이모지)
 * - grades:     등급. 낮은 등급부터 순서대로. statMult(주 스탯 배율), subMult(부가옵션 배율),
 *               subCount(부가옵션 개수 [최소, 최대]), salvage(분해 보상)
 * - subOptions: 부가옵션 종류. range는 '일반 등급 기준' 값 범위(%), power는 1%당 전투력
 *               id는 게임 로직과 연결되어 있으니 바꾸지 말 것 (이름·범위·전투력은 자유)
 * - items:      장비. part, stat(voice/tech/writing/charm), range(일반 등급 기준 주 스탯 범위)
 * 형식이 틀리면 게임 시작 시 어디가 틀렸는지 에러로 알려 준다.
 */
import raw from './equipment.json';
import { STAT_KEYS, type StatKey } from './stats';

export const SUB_OPTION_IDS = ['listenersPct', 'legendStoryPct', 'allStatsPct', 'offlinePct', 'salvagePct', 'ticketRegenPct'] as const;
export type SubOptionId = (typeof SUB_OPTION_IDS)[number];

export interface PartDef {
  id: string;
  name: string;
  icon: string;
}

export interface GradeDef {
  id: string;
  name: string;
  color: string;
  statMult: number;
  subMult: number;
  subCount: [number, number];
  salvage: { stones: number; parts: number };
}

export interface SubOptionDef {
  id: SubOptionId;
  name: string;
  range: [number, number];
  power: number;
}

export interface ItemDef {
  id: string;
  part: string;
  name: string;
  stat: StatKey;
  range: [number, number];
}

const isRange = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && n >= 0) && v[0] <= v[1];

function validate(data: typeof raw) {
  const fail = (where: string, msg: string): never => {
    throw new Error(`equipment.json ${where}: ${msg}`);
  };
  const ids = new Set<string>();
  const unique = (where: string, id: unknown) => {
    if (typeof id !== 'string' || !id) fail(where, 'id가 없습니다');
    if (ids.has(id as string)) fail(where, `id "${id}"가 중복됩니다`);
    ids.add(id as string);
  };

  const parts: PartDef[] = data.parts.map((p, i) => {
    unique(`parts[${i}]`, p.id);
    return { id: p.id, name: p.name ?? p.id, icon: p.icon ?? '📦' };
  });
  if (parts.length === 0) fail('parts', '부위가 하나도 없습니다');

  const grades: GradeDef[] = data.grades.map((g, i) => {
    const where = `grades[${i}] (${g.id})`;
    unique(where, g.id);
    if (typeof g.statMult !== 'number' || typeof g.subMult !== 'number') fail(where, 'statMult/subMult가 숫자가 아닙니다');
    if (!isRange(g.subCount) || g.subCount[1] > SUB_OPTION_IDS.length) fail(where, 'subCount는 [최소, 최대] 형식이어야 합니다');
    return { id: g.id, name: g.name, color: g.color, statMult: g.statMult, subMult: g.subMult, subCount: g.subCount as [number, number], salvage: g.salvage };
  });

  const subOptions: SubOptionDef[] = data.subOptions.map((s, i) => {
    const where = `subOptions[${i}] (${s.id})`;
    if (!(SUB_OPTION_IDS as readonly string[]).includes(s.id)) fail(where, `id는 ${SUB_OPTION_IDS.join('/')} 중 하나여야 합니다`);
    if (!isRange(s.range)) fail(where, 'range는 [최소, 최대] 형식이어야 합니다');
    return { id: s.id as SubOptionId, name: s.name, range: s.range as [number, number], power: s.power };
  });

  const items: ItemDef[] = data.items.map((it, i) => {
    const where = `items[${i}] (${it.id})`;
    unique(where, it.id);
    if (!parts.some((p) => p.id === it.part)) fail(where, `알 수 없는 부위 "${it.part}"`);
    if (!(STAT_KEYS as readonly string[]).includes(it.stat)) fail(where, `stat은 ${STAT_KEYS.join('/')} 중 하나여야 합니다`);
    if (!isRange(it.range)) fail(where, 'range는 [최소, 최대] 형식이어야 합니다');
    return { id: it.id, part: it.part, name: it.name, stat: it.stat as StatKey, range: it.range as [number, number] };
  });
  for (const p of parts) if (!items.some((it) => it.part === p.id)) fail(`parts (${p.id})`, '이 부위의 장비가 하나도 없습니다');

  return { parts, grades, subOptions, items };
}

const DATA = validate(raw);
export const PARTS: readonly PartDef[] = DATA.parts;
export const GRADES: readonly GradeDef[] = DATA.grades;
export const SUB_OPTIONS: readonly SubOptionDef[] = DATA.subOptions;
export const ITEMS: readonly ItemDef[] = DATA.items;

const itemMap = new Map(ITEMS.map((i) => [i.id, i]));
const gradeMap = new Map(GRADES.map((g, i) => [g.id, { ...g, rank: i }]));
const subMap = new Map(SUB_OPTIONS.map((s) => [s.id, s]));
const partMap = new Map(PARTS.map((p) => [p.id, p]));

export const getItemDef = (id: string) => itemMap.get(id);
export const getGrade = (id: string) => gradeMap.get(id);
export const getSubOption = (id: string) => subMap.get(id as SubOptionId);
export const getPart = (id: string) => partMap.get(id);
/** 등급 순위 (일반 0 ~ 신화 5) */
export const gradeRank = (id: string) => gradeMap.get(id)?.rank ?? -1;
