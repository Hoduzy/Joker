import type { Stats } from './stats';

export type Rarity = 'R' | 'SR' | 'SSR';

export interface MemberDef {
  id: string;
  name: string;
  /** 일러스트가 들어가기 전까지 쓰는 대표 색상 */
  color: string;
  rarity: Rarity;
  /** 한 줄 소개 */
  tagline: string;
  stats: Stats;
}

/** 임시 부원 목록. 가챠가 들어오면 여기에 계속 추가한다. */
export const MEMBERS: readonly MemberDef[] = [
  {
    id: 'haneul',
    name: '하늘',
    color: '#7aa2ff',
    rarity: 'SSR',
    tagline: '새벽 3시의 목소리',
    stats: { voice: 32, tech: 8, writing: 14, charm: 22 },
  },
  {
    id: 'mirae',
    name: '미래',
    color: '#5fd3b3',
    rarity: 'SR',
    tagline: '믹서 앞에서만 수다쟁이',
    stats: { voice: 9, tech: 30, writing: 11, charm: 12 },
  },
  {
    id: 'seoyun',
    name: '서윤',
    color: '#f5b971',
    rarity: 'SR',
    tagline: '사연함은 늘 꽉 차 있다',
    stats: { voice: 12, tech: 10, writing: 28, charm: 14 },
  },
  {
    id: 'yuri',
    name: '유리',
    color: '#ff8fb8',
    rarity: 'R',
    tagline: '오늘의 게스트, 내일도 게스트',
    stats: { voice: 16, tech: 6, writing: 9, charm: 26 },
  },
  {
    id: 'dahye',
    name: '다혜',
    color: '#b28dff',
    rarity: 'R',
    tagline: '뭐든 적당히 잘하는 부장',
    stats: { voice: 17, tech: 16, writing: 16, charm: 15 },
  },
];

const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.id, m]));

export function getMember(id: string): MemberDef | undefined {
  return MEMBER_MAP.get(id);
}
