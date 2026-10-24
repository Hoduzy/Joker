/**
 * 부원(캐릭터) 기본 정보. 능력치·등급은 카드(cards.json)마다 따로 있다.
 * 이미지 폴더 이름(assets/characters/<id>)과 id가 같아야 한다.
 */
export interface MemberDef {
  id: string;
  name: string;
  /** 대표 색상 (UI 강조색, 이미지가 없을 때의 대체 박스) */
  color: string;
  /** 한 줄 소개 */
  tagline: string;
}

export const MEMBERS: readonly MemberDef[] = [
  { id: 'haneul', name: '하늘', color: '#ff8fb8', tagline: '새벽 3시의 목소리' },
  { id: 'mirae', name: '미래', color: '#b8c0cc', tagline: '믹서 앞에서만 수다쟁이' },
  { id: 'seoyun', name: '서윤', color: '#a9c4e8', tagline: '사연함은 늘 꽉 차 있다' },
  { id: 'yuri', name: '유리', color: '#c89a6e', tagline: '오늘의 게스트, 내일도 게스트' },
  { id: 'dahye', name: '다혜', color: '#d94a5a', tagline: '방송부 완장은 절대 안 뗀다' },
];

const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.id, m]));

export function getMember(id: string): MemberDef | undefined {
  return MEMBER_MAP.get(id);
}
