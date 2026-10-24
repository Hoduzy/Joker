import { BALANCE } from '../data/balance';
import { getCard, starterCardOf } from '../data/cards';
import { SUB_OPTION_IDS, getGrade, getItemDef, gradeRank, type SubOptionId } from '../data/equipment';
import { getCorner } from '../data/flavor';
import { maxCardLevel } from './economy';
import { maxBoxLevel, type EquipItem } from './equipment';
import { getMember } from '../data/members';
import { SLOT_IDS } from '../data/slots';
import {
  createBox,
  createInitialState,
  emptyAssignments,
  emptyEquipment,
  SAVE_VERSION,
  starterCards,
  todayCorner,
  type BoxState,
  type GameState,
  type OwnedCard,
} from './state';

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
const clampPity = (v: unknown) => Math.min(BALANCE.gacha.pity - 1, Math.max(0, Math.floor(num(v, 0))));

/**
 * 저장된 데이터를 현재 형식으로 맞춘다.
 * 버전별 변환을 차례로 적용한 뒤, 값이 이상하면 기본값으로 바로잡는다.
 */
export function migrate(data: unknown, now: number): GameState {
  if (typeof data !== 'object' || data === null) return createInitialState(now);
  let d = data as Record<string, unknown>;
  const version = num(d.version, 1);
  if (version < 2) d = migrateV1toV2(d, now);
  if (version < 3) d = migrateV2toV3(d, now);
  if (version < 4) d = migrateV3toV4(d, now);
  if (version < 5) d = migrateV4toV5(d);
  // v5 → v6: 한정 모집 천장 카운트(gacha.bannerPity) 추가 — 기본값은 normalize에서 채운다
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
    if (cardId) cards[cardId] = { limitBreak: 0, level: 1, obtainedAt: now };
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
    gacha: { pity: 0, bannerPity: {}, totalPulls: 0 },
    lastTick: d.lastTick,
  };
}

/**
 * v2 → v3: 협찬 택배·장비 추가. 기존 진행은 그대로 두고
 * 빈 장비 칸과 시작 티켓을 넣는다.
 */
function migrateV2toV3(d: Record<string, unknown>, now: number): Record<string, unknown> {
  return { ...d, version: 3, equipment: emptyEquipment(), box: createBox(now), nextUid: 1 };
}

/** v3 → v4: 오늘의 코너 추가 */
function migrateV3toV4(d: Record<string, unknown>, now: number): Record<string, unknown> {
  return { ...d, version: 4, corner: todayCorner(now) };
}

/** v4 → v5: 카드 강화 레벨(모두 1부터)과 라이벌 대결 진행 추가 */
function migrateV4toV5(d: Record<string, unknown>): Record<string, unknown> {
  const cards = (typeof d.cards === 'object' && d.cards !== null ? d.cards : {}) as Record<string, Record<string, unknown>>;
  const withLevel: Record<string, unknown> = {};
  for (const [id, c] of Object.entries(cards)) withLevel[id] = { ...c, level: 1 };
  return { ...d, version: 5, cards: withLevel, dungeon: { stage: 1 } };
}

/** 저장된 장비 1개 검사. 정의가 사라졌거나 값이 이상하면 null */
function normalizeItem(raw: unknown, part?: string): EquipItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const it = raw as Partial<EquipItem>;
  const def = typeof it.item === 'string' ? getItemDef(it.item) : undefined;
  if (!def || (part && def.part !== part) || typeof it.grade !== 'string' || !getGrade(it.grade)) return null;
  const subs = Array.isArray(it.subs)
    ? it.subs.filter((s): s is { id: SubOptionId; value: number } => !!s && SUB_OPTION_IDS.includes(s.id) && typeof s.value === 'number' && s.value >= 0)
    : [];
  return {
    uid: Math.floor(num(it.uid, 0)),
    item: def.id,
    grade: it.grade,
    main: Math.max(0, Math.round(num(it.main, 0))),
    subs,
    boxLevel: Math.max(1, Math.floor(num(it.boxLevel, 1))),
  };
}

function normalizeCorner(raw: unknown, now: number): GameState['corner'] {
  const c = raw as Partial<GameState['corner']> | undefined;
  if (c && typeof c.id === 'string' && getCorner(c.id) && typeof c.day === 'string') return { id: c.id, day: c.day };
  return todayCorner(now);
}

function normalizeBox(raw: unknown, now: number): BoxState {
  const base = createBox(now);
  if (typeof raw !== 'object' || raw === null) return base;
  const b = raw as Partial<BoxState>;
  const auto = (b.auto ?? {}) as Partial<BoxState['auto']>;
  return {
    level: Math.min(maxBoxLevel(), Math.max(1, Math.floor(num(b.level, 1)))),
    parts: Math.max(0, Math.floor(num(b.parts, 0))),
    tickets: Math.max(0, Math.floor(num(b.tickets, base.tickets))),
    ticketClock: Math.min(num(b.ticketClock, now), now),
    pending: normalizeItem(b.pending),
    opened: Math.max(0, Math.floor(num(b.opened, 0))),
    auto: {
      minGrade: auto.minGrade === null ? null : typeof auto.minGrade === 'string' && gradeRank(auto.minGrade) >= 0 ? auto.minGrade : base.auto.minGrade,
      stopOnUpgrade: typeof auto.stopOnUpgrade === 'boolean' ? auto.stopOnUpgrade : base.auto.stopOnUpgrade,
    },
  };
}

/** 최신 형식 데이터의 값 검사·보정 */
function normalize(d: Record<string, unknown>, now: number): GameState {
  const rawCards = (typeof d.cards === 'object' && d.cards !== null ? d.cards : {}) as Record<string, Partial<OwnedCard>>;
  const cards: Record<string, OwnedCard> = {};
  for (const [id, owned] of Object.entries(rawCards)) {
    if (!getCard(id)) continue; // 삭제된 카드
    const limitBreak = Math.min(BALANCE.limitBreak.max, Math.max(0, Math.floor(num(owned?.limitBreak, 0))));
    cards[id] = {
      limitBreak,
      level: Math.min(maxCardLevel(limitBreak), Math.max(1, Math.floor(num(owned?.level, 1)))),
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
  const rawEquip = (typeof d.equipment === 'object' && d.equipment !== null ? d.equipment : {}) as Record<string, unknown>;
  const equipment = emptyEquipment();
  for (const part of Object.keys(equipment)) equipment[part] = normalizeItem(rawEquip[part], part);
  const box = normalizeBox(d.box, now);
  // uid가 겹치지 않도록 지금까지 쓴 가장 큰 번호보다 크게
  const maxUid = Math.max(0, box.pending?.uid ?? 0, ...Object.values(equipment).map((e) => e?.uid ?? 0));
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
      pity: clampPity(gacha.pity),
      bannerPity: Object.fromEntries(
        Object.entries((typeof gacha.bannerPity === 'object' && gacha.bannerPity !== null ? gacha.bannerPity : {}) as Record<string, unknown>).map(([k, v]) => [k, clampPity(v)]),
      ),
      totalPulls: Math.max(0, Math.floor(num(gacha.totalPulls, 0))),
    },
    equipment,
    box,
    nextUid: Math.max(maxUid + 1, Math.floor(num(d.nextUid, 1))),
    corner: normalizeCorner(d.corner, now),
    dungeon: { stage: Math.max(1, Math.floor(num((d.dungeon as { stage?: unknown } | undefined)?.stage, 1))) },
    lastTick: Math.min(num(d.lastTick, now), now),
  };
}
