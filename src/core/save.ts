import { SLOT_IDS } from '../data/slots';
import { getMember } from '../data/members';
import { createInitialState, SAVE_VERSION, type GameState } from './state';

const STORAGE_KEY = 'simya-bangsongbu/save';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('저장 실패', err);
  }
}

export function loadGame(now: number): GameState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // 사파리 개인 정보 보호 모드 등에서는 접근 자체가 막힐 수 있다.
  }
  if (!raw) return createInitialState(now);
  try {
    return migrate(JSON.parse(raw), now);
  } catch (err) {
    console.warn('세이브 데이터가 손상되어 새로 시작합니다', err);
    return createInitialState(now);
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}

/**
 * 저장된 데이터를 현재 형식으로 맞춘다.
 * 필드가 추가되면 기본값으로 채우고, 버전이 오르면 여기에 변환 단계를 추가한다.
 */
export function migrate(data: unknown, now: number): GameState {
  const base = createInitialState(now);
  if (typeof data !== 'object' || data === null) return base;
  const d = data as Partial<GameState>;

  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const ownedMembers = Array.isArray(d.ownedMembers)
    ? d.ownedMembers.filter((id): id is string => typeof id === 'string' && !!getMember(id))
    : base.ownedMembers;

  const assignments = { ...base.assignments };
  const used = new Set<string>();
  for (const slot of SLOT_IDS) {
    const id = d.assignments?.[slot];
    if (typeof id === 'string' && ownedMembers.includes(id) && !used.has(id)) {
      assignments[slot] = id;
      used.add(id);
    }
  }

  return {
    version: SAVE_VERSION,
    listeners: Math.max(0, num(d.listeners, 0)),
    totalListeners: Math.max(0, num(d.totalListeners, 0)),
    towerLevel: Math.max(1, Math.floor(num(d.towerLevel, 1))),
    assignments,
    ownedMembers,
    lastTick: Math.min(num(d.lastTick, now), now),
  };
}
