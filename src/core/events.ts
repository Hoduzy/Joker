import { BALANCE } from '../data/balance';
import { cardsOfRarity, getCard, type CardDef, type Rarity } from '../data/cards';
import { EVENTS, getEvent, type EventDef, type EventMission, type EventMissionKind, type EventRewards } from '../data/events';
import { dayKey } from '../data/flavor';
import { grantCard, type PullResult, type Rng } from './gacha';
import { createEventProgress, type EventProgress, type GameState } from './state';

/**
 * 시즌 이벤트 진행 (데이터는 data/events.json).
 * 상태는 state.events.progress[이벤트 id] 에 이벤트마다 따로 쌓인다 — 천장·미션·교환 횟수는 그 이벤트 안에서만.
 */

/** 지금 진행 중인 이벤트. 개발자 옵션 '이벤트 강제 시작'이면 날짜와 상관없이 아직 안 끝난(없으면 마지막) 이벤트 */
export function activeEvent(state: GameState, now: number): EventDef | undefined {
  // 관리자 치트 '이벤트 강제 종료'
  if (state.cheat?.eventOff) return undefined;
  const live = EVENTS.find((e) => now >= e.start && now <= e.end);
  if (live) return live;
  if (!state.events.force) return undefined;
  return EVENTS.find((e) => now <= e.end) ?? EVENTS[EVENTS.length - 1];
}

export function isEventActive(state: GameState, ev: EventDef, now: number): boolean {
  return activeEvent(state, now)?.id === ev.id;
}

/** 이벤트 진행 기록 (처음이면 만든다) */
export function eventProgress(state: GameState, id: string, now = Date.now()): EventProgress {
  return (state.events.progress[id] ??= createEventProgress(now));
}

function refreshDaily(p: EventProgress, day: string): boolean {
  if (p.daily.day === day) return false;
  p.daily = { day, progress: {}, claimed: [] };
  return true;
}

export function rand(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ───────────── 미션

/** 미션 진행 (이벤트 기간에만). 새로 달성한 미션 id들을 돌려준다 */
export function trackEvent(state: GameState, kind: EventMissionKind, amount: number, now: number): string[] {
  const ev = activeEvent(state, now);
  if (!ev || amount <= 0) return [];
  const p = eventProgress(state, ev.id, now);
  refreshDaily(p, dayKey(new Date(now)));
  const done: string[] = [];
  const bump = (list: EventMission[], prog: Record<string, number>, scope: string) => {
    for (const m of list) {
      if (m.kind !== kind) continue;
      const before = prog[m.id] ?? 0;
      prog[m.id] = Math.min(m.goal, before + amount);
      if (before < m.goal && prog[m.id] >= m.goal) done.push(`${scope}:${m.id}`);
    }
  };
  bump(ev.missions.daily, p.daily.progress, 'daily');
  bump(ev.missions.total, p.total.progress, 'total');
  return done;
}

/** 누적 미션 진행을 값으로 맞춘다 (이벤트 스토리 본 화 수처럼 다시 셀 수 있는 것) */
export function setEventTotal(state: GameState, kind: EventMissionKind, value: number, now: number): string[] {
  const ev = activeEvent(state, now);
  if (!ev) return [];
  const p = eventProgress(state, ev.id, now);
  const done: string[] = [];
  for (const m of ev.missions.total) {
    if (m.kind !== kind) continue;
    const before = p.total.progress[m.id] ?? 0;
    p.total.progress[m.id] = Math.min(m.goal, Math.max(before, value));
    if (before < m.goal && p.total.progress[m.id] >= m.goal) done.push(`total:${m.id}`);
  }
  return done;
}

export function grantEventRewards(state: GameState, p: EventProgress, r: EventRewards): void {
  p.candy += r.candy ?? 0;
  state.stones += r.stones ?? 0;
  state.box.tickets += r.tickets ?? 0;
  state.kits += r.kits ?? 0;
}

/** 미션 보상 받기. 받을 수 없으면 null */
export function claimEventMission(state: GameState, scope: 'daily' | 'total', id: string, now: number): EventRewards | null {
  const ev = activeEvent(state, now);
  if (!ev) return null;
  const p = eventProgress(state, ev.id, now);
  refreshDaily(p, dayKey(new Date(now)));
  const m = ev.missions[scope].find((x) => x.id === id);
  const box = scope === 'daily' ? p.daily : p.total;
  if (!m || box.claimed.includes(id) || (box.progress[id] ?? 0) < m.goal) return null;
  box.claimed.push(id);
  grantEventRewards(state, p, m.reward);
  return m.reward;
}

export function eventClaimable(state: GameState, now: number): number {
  const ev = activeEvent(state, now);
  if (!ev) return 0;
  const p = eventProgress(state, ev.id, now);
  const day = dayKey(new Date(now));
  const daily = p.daily.day === day ? ev.missions.daily.filter((m) => (p.daily.progress[m.id] ?? 0) >= m.goal && !p.daily.claimed.includes(m.id)).length : 0;
  const total = ev.missions.total.filter((m) => (p.total.progress[m.id] ?? 0) >= m.goal && !p.total.claimed.includes(m.id)).length;
  return daily + total;
}

// ───────────── 획득처

/**
 * 방치 드롭: 마지막 정산 이후 everyMin분마다 chance 확률로 사탕.
 * 꺼 둔 시간은 offlineCapHours까지만. 얻은 사탕 수를 돌려준다
 */
export function rollIdleCandy(state: GameState, now: number, rng: Rng): number {
  const ev = activeEvent(state, now);
  if (!ev) return 0;
  const p = eventProgress(state, ev.id, now);
  const d = ev.drops.idle;
  const step = d.everyMin * 60000;
  if (!d.chance || step <= 0) return 0;
  // 이벤트 시작 전 시간은 세지 않는다 (강제 시작이면 진행 기록을 만든 때부터)
  const from = state.events.force ? p.idleAt : Math.max(p.idleAt, ev.start);
  let rolls = Math.floor((now - from) / step);
  if (rolls <= 0) return 0;
  p.idleAt = from + rolls * step;
  rolls = Math.min(rolls, Math.floor((d.offlineCapHours * 3600000) / step));
  let got = 0;
  for (let i = 0; i < rolls; i++) if (rng() < d.chance) got += rand(rng, d.min, d.max);
  p.candy += got;
  return got;
}

/** 협찬 택배를 열 때: 낮은 확률로 '할로윈 택배' (사탕). 얻은 수, 없으면 0 */
export function rollBoxCandy(state: GameState, now: number, rng: Rng): number {
  const ev = activeEvent(state, now);
  if (!ev) return 0;
  const d = ev.drops.box;
  if (rng() >= d.chance) return 0;
  const got = rand(rng, d.min, d.max);
  eventProgress(state, ev.id, now).candy += got;
  return got;
}

/** 이벤트 격파 상대의 체력: 우리 공격력 × 제한 시간 × (기본 + 이긴 횟수만큼 조금씩) */
export function ghostHp(state: GameState, ev: EventDef, attackPerSec: number): number {
  const r = ev.drops.rival;
  const wins = state.events.progress[ev.id]?.ghost.wins ?? 0;
  const factor = Math.min(r.hpFactorMax, r.hpFactor + r.hpGrowthPerWin * wins);
  return Math.max(1, Math.round(attackPerSec * (BALANCE.dungeon.timeLimitMs / 1000) * factor));
}

/** 이벤트 격파 승리: 하루 정해진 횟수까지 사탕 (첫 승리는 보너스). 얻은 사탕과 오늘 남은 보상 횟수 */
export function winGhost(state: GameState, now: number): { candy: number; left: number } | null {
  const ev = activeEvent(state, now);
  if (!ev) return null;
  const p = eventProgress(state, ev.id, now);
  const r = ev.drops.rival;
  const day = dayKey(new Date(now));
  if (p.ghost.day !== day) p.ghost = { ...p.ghost, day, candyWins: 0 };
  let candy = 0;
  if (p.ghost.wins === 0) candy += r.firstWinCandy;
  if (p.ghost.candyWins < r.dailyCandyWins) {
    candy += r.candy;
    p.ghost.candyWins += 1;
  }
  p.ghost.wins += 1;
  p.candy += candy;
  return { candy, left: Math.max(0, r.dailyCandyWins - p.ghost.candyWins) };
}

// ───────────── 한정 모집

/** 이벤트 모집 등급 굴리기 (U → SSR → SR → R 순서로 누적) */
export function rollEventRarity(ev: EventDef, rng: Rng): Rarity {
  const r = rng();
  const { U, SSR, SR } = ev.gacha.rates;
  if (r < U) return 'U';
  if (r < U + SSR) return 'SSR';
  if (r < U + SSR + SR) return 'SR';
  return 'R';
}

function pickEventCard(ev: EventDef, rarity: Rarity, rng: Rng): CardDef {
  const pool = rarity === 'U' ? ev.cards.map((id) => getCard(id)!).filter(Boolean) : cardsOfRarity(rarity);
  return pool[Math.floor(rng() * pool.length)];
}

export function eventPullCost(ev: EventDef, count: 1 | 10): number {
  return count === 10 ? ev.gacha.ten : ev.gacha.single;
}

/**
 * 이벤트 한정 모집 count회 (사탕 차감 포함). 사탕이 모자라거나 기간이 아니면 null.
 * - 천장: U 없이 pity-1회를 뽑았으면 다음 1회는 U 확정 (이 이벤트 안에서만 센다)
 * - 10연: 앞 9장에 SR 이상이 없으면 10번째는 SR 이상
 */
export function eventPull(state: GameState, count: 1 | 10, rng: Rng, now: number): PullResult[] | null {
  const ev = activeEvent(state, now);
  if (!ev) return null;
  const p = eventProgress(state, ev.id, now);
  const cost = eventPullCost(ev, count);
  if (p.candy < cost) return null;
  p.candy -= cost;
  const results: PullResult[] = [];
  let srPlus = false;
  for (let i = 0; i < count; i++) {
    const byPity = p.pity + 1 >= ev.gacha.pity;
    let rarity: Rarity = state.cheat?.nextRarity ?? (byPity ? 'U' : rollEventRarity(ev, rng));
    if (count === 10 && i === count - 1 && !srPlus && rarity === 'R' && !state.cheat?.nextRarity) rarity = 'SR';
    if (rarity !== 'R') srPlus = true;
    p.pity = rarity === 'U' ? 0 : p.pity + 1;
    p.pulls += 1;
    state.gacha.totalPulls += 1;
    results.push({ ...grantCard(state, pickEventCard(ev, rarity, rng), byPity, now), pickup: rarity === 'U' });
  }
  return results;
}

// ───────────── 교환소

export function shopBought(state: GameState, ev: EventDef, itemId: string): number {
  return state.events.progress[ev.id]?.shop[itemId] ?? 0;
}

/** 교환. card 종류는 cardId(이벤트 U 카드)를 골라야 한다. 지급한 카드 결과(카드일 때) 또는 true, 실패하면 null */
export function buyShopItem(state: GameState, itemId: string, now: number, cardId?: string): { card?: Omit<PullResult, 'pickup'> } | null {
  const ev = activeEvent(state, now);
  if (!ev) return null;
  const item = ev.shop.find((s) => s.id === itemId);
  const p = eventProgress(state, ev.id, now);
  if (!item || p.candy < item.price || shopBought(state, ev, itemId) >= item.limit) return null;
  if (item.kind === 'card' && (!cardId || !ev.cards.includes(cardId))) return null;
  p.candy -= item.price;
  p.shop[itemId] = (p.shop[itemId] ?? 0) + 1;
  if (item.kind === 'card') return { card: grantCard(state, getCard(cardId!)!, false, now) };
  if (item.kind === 'stones') state.stones += item.amount;
  if (item.kind === 'tickets') state.box.tickets += item.amount;
  if (item.kind === 'kits') state.kits += item.amount;
  return {};
}

// ───────────── 끝난 이벤트

export interface Conversion {
  event: EventDef;
  candy: number;
  stones: number;
}

/** 끝난 이벤트에 남은 재화를 전파석으로 바꾼다 (한 번만). 바꾼 목록 */
export function convertEndedEvents(state: GameState, now: number): Conversion[] {
  const out: Conversion[] = [];
  const live = activeEvent(state, now);
  for (const [id, p] of Object.entries(state.events.progress)) {
    const ev = getEvent(id);
    if (!ev || p.converted || (now <= ev.end && !state.cheat?.eventOff) || live?.id === id) continue;
    p.converted = true;
    if (p.candy <= 0) continue;
    const stones = p.candy * ev.currency.stonesPerUnit;
    out.push({ event: ev, candy: p.candy, stones });
    state.stones += stones;
    p.candy = 0;
  }
  return out;
}

// ───────────── 청취자 보너스

/** 진행 중인 이벤트의 U 카드를 배치하면 장당 청취자 +% (배수로 돌려준다) */
export function eventListenerMultiplier(state: GameState, now: number): number {
  const ev = activeEvent(state, now);
  if (!ev || !ev.listenerBonusPct) return 1;
  const n = Object.values(state.assignments).filter((id) => id && ev.cards.includes(id)).length;
  return 1 + (n * ev.listenerBonusPct) / 100;
}

/** 이벤트 화면용: 남은 시간 */
export function eventTimeLeft(ev: EventDef, now: number): number {
  return Math.max(0, ev.end - now);
}
