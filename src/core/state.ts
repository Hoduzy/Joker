import { BALANCE } from '../data/balance';
import { cornerForDay, dayKey } from '../data/flavor';
import { PARTS } from '../data/equipment';
import type { AutoSettings, EquipItem } from './equipment';
import { MEMBERS } from '../data/members';
import { starterCardOf } from '../data/cards';
import { SLOT_IDS, type SlotId } from '../data/slots';

export const SAVE_VERSION = 5;

export interface OwnedCard {
  /** 돌파 단계 0~5 */
  limitBreak: number;
  /** 강화 레벨 1~ (최대는 돌파 단계에 따라) */
  level: number;
  /** 처음 얻은 시각 (epoch ms) */
  obtainedAt: number;
}

export interface GameState {
  version: number;
  /** 현재 보유 청취자 (재화) */
  listeners: number;
  /** 누적 획득 청취자 (마일스톤 판정용) */
  totalListeners: number;
  towerLevel: number;
  /** 전파석 (뽑기 재화) */
  stones: number;
  /** 지금까지 달성한 청취자 마일스톤 개수 */
  milestonesReached: number;
  /** 보유 카드: 카드 id → 돌파 정보 */
  cards: Record<string, OwnedCard>;
  /** 슬롯별 배치된 카드 id. 비어 있으면 null */
  assignments: Record<SlotId, string | null>;
  gacha: {
    /** 마지막 SSR 이후 뽑은 횟수 (천장 카운트) */
    pity: number;
    totalPulls: number;
  };
  /** 부위 id → 장착 중인 공용 장비 */
  equipment: Record<string, EquipItem | null>;
  box: BoxState;
  /** 장비 고유 번호 발급용 */
  nextUid: number;
  /** 오늘의 코너 id와 그 날짜 (날짜가 바뀌면 다음 코너로) */
  corner: { id: string; day: string };
  /** 라이벌 방송부 대결: 다음에 도전할 스테이지 (1부터) */
  dungeon: { stage: number };
  /** 마지막으로 시간이 정산된 시각 (epoch ms) */
  lastTick: number;
}

export interface BoxState {
  level: number;
  /** 레벨업용 부품 */
  parts: number;
  tickets: number;
  /** 티켓 충전 기준 시각 (epoch ms) */
  ticketClock: number;
  /** 열었지만 아직 교체/분해를 고르지 않은 장비 (새로고침해도 유지) */
  pending: EquipItem | null;
  /** 지금까지 연 택배 수 */
  opened: number;
  auto: AutoSettings;
}

export function todayCorner(now: number): { id: string; day: string } {
  const day = dayKey(new Date(now));
  return { id: cornerForDay(day).id, day };
}

export function emptyEquipment(): Record<string, EquipItem | null> {
  const e: Record<string, EquipItem | null> = {};
  for (const p of PARTS) e[p.id] = null;
  return e;
}

export function createBox(now: number): BoxState {
  return {
    level: 1,
    parts: 0,
    tickets: BALANCE.tickets.start,
    ticketClock: now,
    pending: null,
    opened: 0,
    auto: { minGrade: 'epic', stopOnUpgrade: true },
  };
}

export function emptyAssignments(): Record<SlotId, string | null> {
  const a = {} as Record<SlotId, string | null>;
  for (const id of SLOT_IDS) a[id] = null;
  return a;
}

/** 부원마다 R 카드 1장씩 */
export function starterCards(now: number): Record<string, OwnedCard> {
  const cards: Record<string, OwnedCard> = {};
  for (const m of MEMBERS) {
    const id = starterCardOf(m.id);
    if (id) cards[id] = { limitBreak: 0, level: 1, obtainedAt: now };
  }
  return cards;
}

export function createInitialState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    listeners: 0,
    totalListeners: 0,
    towerLevel: 1,
    stones: BALANCE.stones.welcomeGift,
    milestonesReached: 0,
    cards: starterCards(now),
    assignments: emptyAssignments(),
    gacha: { pity: 0, totalPulls: 0 },
    equipment: emptyEquipment(),
    box: createBox(now),
    nextUid: 1,
    corner: todayCorner(now),
    dungeon: { stage: 1 },
    lastTick: now,
  };
}
