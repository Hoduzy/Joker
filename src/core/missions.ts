import { BALANCE } from '../data/balance';
import type { GameState } from './state';

export type MissionKind =
  | 'openBox'
  | 'battle'
  | 'pull'
  | 'enhance'
  | 'gift'
  | 'talk'
  | 'legend'
  | 'accident'
  | 'towerUp'
  | 'textReply';

export interface MissionDef {
  id: string;
  kind: MissionKind;
  goal: number;
  label: string;
}

/** 미션 후보. 매일 이 중 5개가 날짜에 따라 정해진다 */
export const MISSION_POOL: readonly MissionDef[] = [
  { id: 'box30', kind: 'openBox', goal: 30, label: '협찬 택배 30번 열기' },
  { id: 'battle3', kind: 'battle', goal: 3, label: '라이벌 대결 3번 하기' },
  { id: 'pull10', kind: 'pull', goal: 10, label: '부원 모집 10회' },
  { id: 'enhance5', kind: 'enhance', goal: 5, label: '카드 강화 5번 시도' },
  { id: 'gift3', kind: 'gift', goal: 3, label: '부원에게 선물 3번' },
  { id: 'talk5', kind: 'talk', goal: 5, label: '부원과 5번 대화' },
  { id: 'legend1', kind: 'legend', goal: 1, label: '레전드 사연 엽서 잡기' },
  { id: 'accident1', kind: 'accident', goal: 1, label: '방송사고 복구하기' },
  { id: 'tower2', kind: 'towerUp', goal: 2, label: '송신탑 레벨업 2번' },
  { id: 'text2', kind: 'textReply', goal: 2, label: '문자 답장 2번' },
];

export function missionDef(id: string): MissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}

/** 날짜 키로 정해지는 오늘의 미션 5개 (택배·대결은 항상 포함) */
export function missionsForDay(day: string): string[] {
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rest = MISSION_POOL.filter((m) => m.id !== 'box30' && m.id !== 'battle3').map((m) => m.id);
  // 날짜로 섞기 (같은 날이면 항상 같은 결과)
  for (let i = rest.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return ['box30', 'battle3', ...rest.slice(0, BALANCE.missions.perDay - 2)];
}

/** 날짜가 바뀌었으면 새 미션으로 */
export function refreshMissions(state: GameState, day: string): boolean {
  if (state.missions.day === day && state.missions.ids.length) return false;
  state.missions = { day, ids: missionsForDay(day), progress: {}, claimed: [], bonusClaimed: false };
  return true;
}

/** 진행도 올리기. 방금 목표를 채운 미션 id들을 돌려준다 */
export function trackMission(state: GameState, kind: MissionKind, amount = 1): string[] {
  const done: string[] = [];
  for (const id of state.missions.ids) {
    const def = missionDef(id);
    if (!def || def.kind !== kind) continue;
    const before = state.missions.progress[id] ?? 0;
    const after = Math.min(def.goal, before + amount);
    state.missions.progress[id] = after;
    if (before < def.goal && after >= def.goal) done.push(id);
  }
  return done;
}

export function isMissionDone(state: GameState, id: string): boolean {
  const def = missionDef(id);
  return !!def && (state.missions.progress[id] ?? 0) >= def.goal;
}

export function claimableCount(state: GameState): number {
  const m = state.missions;
  const each = m.ids.filter((id) => isMissionDone(state, id) && !m.claimed.includes(id)).length;
  const bonus = !m.bonusClaimed && m.ids.length > 0 && m.ids.every((id) => m.claimed.includes(id)) ? 1 : 0;
  return each + bonus;
}
