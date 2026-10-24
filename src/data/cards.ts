/**
 * 부원 카드 정의. 실제 데이터는 cards.json에 있다.
 *
 * 카드 추가 방법
 *   1. cards.json에 항목을 하나 추가한다 (id는 겹치지 않게).
 *      - member: members.ts의 부원 id
 *      - rarity: "R" | "SR" | "SSR"
 *      - slot:   담당 슬롯 보너스 "dj" | "engineer" | "writer" | "guest"
 *      - stats:  voice / tech / writing / charm
 *   2. (선택) 카드 일러스트를 assets/cards/<카드 id>.png 로 넣는다.
 *      없으면 assets/characters/<부원>/full.png 에 등급 테두리를 씌워 대신 쓴다.
 * 형식이 틀리면 게임 시작 시 어떤 카드가 왜 틀렸는지 에러로 알려 준다.
 */
import raw from './cards.json';
import { getMember } from './members';
import { SLOT_IDS, type SlotId } from './slots';
import { STAT_KEYS, type Stats } from './stats';

export type Rarity = 'R' | 'SR' | 'SSR';
export const RARITIES: readonly Rarity[] = ['SSR', 'SR', 'R'];

export interface CardDef {
  id: string;
  /** 부원 id */
  member: string;
  rarity: Rarity;
  title: string;
  /** 담당 슬롯: 이 슬롯에 배치하면 보너스 */
  slot: SlotId;
  stats: Stats;
  /** 획득 시 한마디 */
  quote: string;
}

function validate(data: unknown): CardDef[] {
  if (!Array.isArray(data)) throw new Error('cards.json은 배열이어야 합니다');
  const seen = new Set<string>();
  return data.map((c, i) => {
    const where = `cards.json[${i}]${c?.id ? ` (${c.id})` : ''}`;
    const fail = (msg: string): never => {
      throw new Error(`${where}: ${msg}`);
    };
    if (typeof c?.id !== 'string' || !c.id) fail('id가 없습니다');
    if (seen.has(c.id)) fail('id가 중복됩니다');
    seen.add(c.id);
    if (!getMember(c.member)) fail(`알 수 없는 부원 "${c.member}"`);
    if (!['R', 'SR', 'SSR'].includes(c.rarity)) fail(`rarity는 R/SR/SSR 중 하나여야 합니다 ("${c.rarity}")`);
    if (!SLOT_IDS.includes(c.slot)) fail(`slot은 ${SLOT_IDS.join('/')} 중 하나여야 합니다 ("${c.slot}")`);
    for (const key of STAT_KEYS) {
      if (typeof c.stats?.[key] !== 'number' || c.stats[key] < 0) fail(`stats.${key}가 올바른 숫자가 아닙니다`);
    }
    return {
      id: c.id,
      member: c.member,
      rarity: c.rarity,
      title: typeof c.title === 'string' ? c.title : c.id,
      slot: c.slot,
      stats: { voice: c.stats.voice, tech: c.stats.tech, writing: c.stats.writing, charm: c.stats.charm },
      quote: typeof c.quote === 'string' ? c.quote : '',
    };
  });
}

export const CARDS: readonly CardDef[] = validate(raw);

const CARD_MAP = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef | undefined {
  return CARD_MAP.get(id);
}

export function cardsOfRarity(rarity: Rarity): CardDef[] {
  return CARDS.filter((c) => c.rarity === rarity);
}

/** 정렬용: SSR → SR → R, 같은 등급이면 cards.json 순서 */
export function compareCards(a: CardDef, b: CardDef): number {
  return RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || CARDS.indexOf(a) - CARDS.indexOf(b);
}

/** 부원의 기본(R) 카드 id. 처음 시작할 때와 이전 세이브 변환에 쓴다. */
export function starterCardOf(memberId: string): string | undefined {
  return CARDS.find((c) => c.member === memberId && c.rarity === 'R')?.id;
}
