import { BALANCE } from '../data/balance';
import { cornerForDay, dayKey } from '../data/flavor';
import { PARTS } from '../data/equipment';
import type { AutoSettings, EquipItem } from './equipment';
import { MEMBERS } from '../data/members';
import { starterCardOf } from '../data/cards';
import { SLOT_IDS, type SlotId } from '../data/slots';

export const SAVE_VERSION = 7;

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
    /** 상시 모집: 마지막 SSR 이후 뽑은 횟수 (천장 카운트) */
    pity: number;
    /** 한정 모집별 천장 카운트 (모집마다 따로) */
    bannerPity: Record<string, number>;
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
  /** 튜닝 키트 (카드 강화 재료) */
  kits: number;
  /** 부원별 호감도 */
  bond: Record<string, BondState>;
  /** 휴대폰 문자 */
  phone: PhoneState;
  /** 메인 스토리: 본 챕터 번호 */
  story: { seen: number[] };
  /** 일일 미션 */
  missions: MissionState;
  /** 마지막으로 시간이 정산된 시각 (epoch ms) */
  lastTick: number;
}

export interface BondState {
  /** 누적 호감도 (방송 배치 시간으로 소수점까지 쌓인다) */
  xp: number;
  /** 대화·선물 횟수를 센 날짜 */
  day: string;
  talks: number;
  gifts: number;
  /** 본 개인 이벤트의 레벨 */
  seenEvents: number[];
}

export interface PhoneMessage {
  from: 'them' | 'me';
  text: string;
  at: number;
}

export interface PhoneThread {
  /** 다음에 올 문자 대화 번호 (texts.json 순서) */
  next: number;
  log: PhoneMessage[];
  /** 답장을 기다리는 대화 번호 (없으면 null) */
  pending: number | null;
  /** 안 읽은 문자 수 */
  unread: number;
}

export interface PhoneState {
  threads: Record<string, PhoneThread>;
  /** 마지막으로 '접속 문자'를 받은 시각 */
  lastLoginText: number;
}

export interface MissionState {
  day: string;
  ids: string[];
  progress: Record<string, number>;
  claimed: string[];
  bonusClaimed: boolean;
}

export function createBond(): Record<string, BondState> {
  const b: Record<string, BondState> = {};
  for (const m of MEMBERS) b[m.id] = { xp: 0, day: '', talks: 0, gifts: 0, seenEvents: [] };
  return b;
}

export function createPhone(): PhoneState {
  const threads: Record<string, PhoneThread> = {};
  for (const m of MEMBERS) threads[m.id] = { next: 0, log: [], pending: null, unread: 0 };
  return { threads, lastLoginText: 0 };
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
/** 처음 시작할 때 있는 부원: 방송부장(다혜) 한 명. 나머지 부원은 뽑기로 만난다 */
export const STARTER_MEMBER = 'dahye';

export function starterCards(now: number): Record<string, OwnedCard> {
  const id = starterCardOf(STARTER_MEMBER);
  return id ? { [id]: { limitBreak: 0, level: 1, obtainedAt: now } } : {};
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
    // 부장이 혼자 DJ 자리를 지키는 데서 시작
    assignments: { ...emptyAssignments(), dj: starterCardOf(STARTER_MEMBER) ?? null },
    gacha: { pity: 0, bannerPity: {}, totalPulls: 0 },
    equipment: emptyEquipment(),
    box: createBox(now),
    nextUid: 1,
    corner: todayCorner(now),
    dungeon: { stage: 1 },
    kits: BALANCE.kits.start,
    bond: createBond(),
    phone: createPhone(),
    story: { seen: [] },
    missions: { day: '', ids: [], progress: {}, claimed: [], bonusClaimed: false },
    lastTick: now,
  };
}
