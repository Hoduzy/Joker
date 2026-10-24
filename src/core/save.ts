import { BALANCE } from '../data/balance';
import { getCard, starterCardOf } from '../data/cards';
import { getMember } from '../data/members';
import { SLOT_IDS } from '../data/slots';
import { createInitialState, emptyAssignments, SAVE_VERSION, starterCards, type GameState, type OwnedCard } from './state';

const STORAGE_KEY = 'simya-bangsongbu/save';
/** 마이그레이션 직전 원본을 남겨 두는 키 (문제가 생기면 복구용) */
const BACKUP_KEY = 'simya-bangsongbu/save-backup-v';

export function saveGame(state: GameState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('저장 실패', err);
  }
}

export function loadGame(now: number): GameState {
  let raw: string | null = null;
  try {
    raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  } catch {
    // 사파리 개인 정보 보호 모드 등에서는 접근 자체가 막힐 수 있다.
  }
  if (!raw) return createInitialState(now);
  try {
    const data = JSON.parse(raw);
    const version = typeof data?.version === 'number' ? data.version : 1;
    if (version < SAVE_VERSION) {
      try {
        localStorage.setItem(BACKUP_KEY + version, raw);
      } catch {
        // 백업 실패는 무시
      }
    }
    return migrate(data, now);
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

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * 저장된 데이터를 현재 형식으로 맞춘다.
 * 버전별 변환을 차례로 적용한 뒤, 값이 이상하면 기본값으로 바로잡는다.
 */
export function migrate(data: unknown, now: number): GameState {
  if (typeof data !== 'object' || data === null) return createInitialState(now);
  let d = data as Record<string, unknown>;
  const version = num(d.version, 1);
  if (version < 2) d = migrateV1toV2(d, now);
  return normalize(d, now);
}

/**
 * v1 → v2: 부원 단위 → 카드 단위
 * - 보유 부원은 그 부원의 R 카드로 바꾼다 (R 카드 능력치 = v1 부원 능력치라 생산량이 거의 그대로다).
 * - 슬롯에 배치된 부원도 R 카드로 바꿔 그대로 배치한다.
 * - 가챠가 새로 생겼으니 환영 선물 전파석을 준다.
 * - 마일스톤은 0부터 시작해서, 이미 넘긴 단계의 보상은 다음 정산 때 한꺼번에 받는다.
 */
function migrateV1toV2(d: Record<string, unknown>, now: number): Record<string, unknown> {
  const ownedMembers = Array.isArray(d.ownedMembers) ? d.ownedMembers.filter((id): id is string => typeof id === 'string' && !!getMember(id)) : [];
  const cards: Record<string, OwnedCard> = {};
  for (const memberId of ownedMembers) {
    const cardId = starterCardOf(memberId);
    if (cardId) cards[cardId] = { limitBreak: 0, obtainedAt: now };
  }
  const oldAssignments = (d.assignments ?? {}) as Record<string, unknown>;
  const assignments = emptyAssignments();
  for (const slot of SLOT_IDS) {
    const memberId = oldAssignments[slot];
    if (typeof memberId === 'string' && ownedMembers.includes(memberId)) assignments[slot] = starterCardOf(memberId) ?? null;
  }
  return {
    version: 2,
    listeners: d.listeners,
    totalListeners: d.totalListeners,
    towerLevel: d.towerLevel,
    stones: BALANCE.stones.welcomeGift,
    milestonesReached: 0,
    cards,
    assignments,
    gacha: { pity: 0, totalPulls: 0 },
    lastTick: d.lastTick,
  };
}

/** v2 형식 데이터의 값 검사·보정 */
function normalize(d: Record<string, unknown>, now: number): GameState {
  const rawCards = (typeof d.cards === 'object' && d.cards !== null ? d.cards : {}) as Record<string, Partial<OwnedCard>>;
  const cards: Record<string, OwnedCard> = {};
  for (const [id, owned] of Object.entries(rawCards)) {
    if (!getCard(id)) continue; // 삭제된 카드
    cards[id] = {
      limitBreak: Math.min(BALANCE.limitBreak.max, Math.max(0, Math.floor(num(owned?.limitBreak, 0)))),
      obtainedAt: num(owned?.obtainedAt, now),
    };
  }
  // 카드가 하나도 없으면 진행이 막히므로 기본 카드를 준다.
  const ownedCards = Object.keys(cards).length > 0 ? cards : starterCards(now);

  const rawAssign = (d.assignments ?? {}) as Record<string, unknown>;
  const assignments = emptyAssignments();
  const usedMembers = new Set<string>();
  for (const slot of SLOT_IDS) {
    const id = rawAssign[slot];
    const card = typeof id === 'string' && ownedCards[id] ? getCard(id) : undefined;
    // 같은 부원은 한 슬롯에만
    if (card && !usedMembers.has(card.member)) {
      assignments[slot] = card.id;
      usedMembers.add(card.member);
    }
  }

  const gacha = (d.gacha ?? {}) as Record<string, unknown>;
  return {
    version: SAVE_VERSION,
    listeners: Math.max(0, num(d.listeners, 0)),
    totalListeners: Math.max(0, num(d.totalListeners, 0)),
    towerLevel: Math.max(1, Math.floor(num(d.towerLevel, 1))),
    stones: Math.max(0, Math.floor(num(d.stones, 0))),
    milestonesReached: Math.max(0, Math.floor(num(d.milestonesReached, 0))),
    cards: ownedCards,
    assignments,
    gacha: {
      pity: Math.min(BALANCE.gacha.pity - 1, Math.max(0, Math.floor(num(gacha.pity, 0)))),
      totalPulls: Math.max(0, Math.floor(num(gacha.totalPulls, 0))),
    },
    lastTick: Math.min(num(d.lastTick, now), now),
  };
}
