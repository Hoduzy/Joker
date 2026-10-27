import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { SLOT_IDS, type SlotId } from '../data/slots';
import { enhanceCost, enhanceKits, enhanceSuccessRate, listenersPerSecond, maxCardLevel, towerUpgradeCost, withAssignment } from './economy';
import { bondLevel, giftCost, giftXp, ownsMember, refreshBondDay, unlockedLines } from './bond';
import { claimableCount, isMissionDone, refreshMissions, trackMission, type MissionKind } from './missions';
import { deliverText, replyText } from './phone';
import { newlyOpenedChapters } from './story';
import { isUnlocked, newlyUnlocked, slotUnlocked, type Feature, type UnlockDef } from './unlocks';
import { dayKey, pick } from '../data/flavor';
import type { Expression } from '../data/portraits';
import { stageReward, type StageReward } from './dungeon';
import { getBanner, isBannerActive, STANDARD_BANNER } from '../data/banners';
import {
  equipBonuses,
  itemPart,
  maxBoxLevel,
  regenTickets,
  rollEquip,
  salvageReward,
  ticketCost,
  type AutoSettings,
  type EquipItem,
} from './equipment';
import { pull as rollPulls, type PullResult, type Rng } from './gacha';
import { calcOfflineReward, type OfflineResult } from './offline';
import { newMilestones, towerUpReward } from './rewards';
import { loadGame, resetSave, saveGame } from './save';
import { createInitialState, todayCorner, type GameState } from './state';
import {
  activeEvent,
  buyShopItem,
  claimEventMission,
  convertEndedEvents,
  eventClaimable,
  eventProgress,
  eventPull,
  ghostHp,
  rollBoxCandy,
  rollIdleCandy,
  setEventTotal,
  trackEvent,
  winGhost,
  type Conversion,
} from './events';
import type { EventDef, EventMissionKind, EventRewards } from '../data/events';
import { getCardStory, hasCardStory } from '../data/cardStories';
import { addCardBond, useCardTalk } from './cardBond';

export type GameEvent =
  /** 배치·레벨·카드 등 화면 구조가 바뀌는 변화 */
  | { type: 'changed' }
  /** 오랫동안 자리를 비웠다가 돌아와서 보상을 받음 */
  | { type: 'offline-reward'; result: OfflineResult }
  /** 슬롯 배치가 바뀜. cardId가 null이면 비움, previous는 원래 있던 카드 */
  | { type: 'assigned'; slotId: SlotId; cardId: string | null; previous: string | null }
  | { type: 'tower-up'; level: number; reward: number }
  /** 누적 청취자 마일스톤 달성 (여러 개를 한꺼번에 넘겼을 수도 있다) */
  | { type: 'milestone'; threshold: number; count: number; stones: number }
  | { type: 'box-level'; level: number }
  /** 청취자 배수(레전드 사연·방송사고)가 생기거나 끝남 */
  | { type: 'boost' }
  /** 날짜가 바뀌어 오늘의 코너가 바뀜 */
  | { type: 'corner'; id: string }
  /** 호감도 레벨 상승 */
  | { type: 'bond-level'; member: string; level: number }
  /** 새 문자 도착 */
  | { type: 'phone'; member: string }
  /** 일일 미션 하나 달성 */
  | { type: 'mission'; id: string }
  /** 누적 청취자로 새 자리·기능이 열림 */
  | { type: 'unlock'; items: UnlockDef[] }
  /** 누적 청취자로 메인 스토리 챕터가 열림 */
  | { type: 'chapter'; id: number }
  /** 시즌 이벤트 재화를 얻음 (방치·꺼 둔 동안·할로윈 택배) */
  | { type: 'event-candy'; amount: number; source: 'idle' | 'offline' | 'box' }
  /** 이벤트 미션 하나 달성 ("daily:box20" 처럼 범위:id) */
  | { type: 'event-mission'; id: string }
  /** 이벤트가 끝나 남은 재화를 전파석으로 바꿈 */
  | { type: 'event-ended'; conversions: Conversion[] }
  /** 카드 호감도 레벨업 (전용 스토리 새 화가 열렸을 수 있다) */
  | { type: 'card-bond'; cardId: string; level: number };

export type EnhanceResult = 'success' | 'fail';

export type BoostKind = 'legend' | 'accident';

export interface Boost {
  kind: BoostKind;
  multiplier: number;
  /** 끝나는 시각 (epoch ms) */
  until: number;
}

export interface SalvageResult {
  stones: number;
  parts: number;
}

type Listener = (event: GameEvent) => void;

/**
 * 게임 상태와 모든 상태 변경 동작을 소유한다.
 * UI는 여기 있는 메서드만 호출하고, 이벤트를 구독해서 화면을 갱신한다.
 */
export class Game {
  state: GameState;
  private listeners = new Set<Listener>();
  private lastSave = 0;
  /** 진행 중인 청취자 배수. 짧은 연출용이라 저장하지 않는다 */
  boosts: Boost[] = [];
  /** 방금 연 택배가 할로윈 택배였다면 들어 있던 사탕 수 (연출용) */
  lastBoxCandy = 0;

  constructor(now = Date.now()) {
    this.state = loadGame(now);
    // 아직 안 열린 자리에 있던 카드는 내린다 (해금 도입 전 세이브)
    for (const slot of SLOT_IDS) if (!slotUnlocked(this.state, slot)) this.state.assignments[slot] = null;
  }

  isUnlocked(feature: Feature): boolean {
    return isUnlocked(this.state, feature);
  }

  slotUnlocked(slot: SlotId): boolean {
    return slotUnlocked(this.state, slot);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GameEvent): void {
    for (const l of this.listeners) l(event);
  }

  /** 지금 초당 청취자 (배수 포함) */
  get rate(): number {
    return listenersPerSecond(this.state) * this.multiplier();
  }

  /** 배수를 뺀 기본 초당 청취자 */
  get baseRate(): number {
    return listenersPerSecond(this.state);
  }

  /** 진행 중인 배수들의 곱 */
  multiplier(now = Date.now()): number {
    return this.boosts.reduce((m, b) => (b.until > now ? m * b.multiplier : m), 1);
  }

  activeBoosts(now = Date.now()): Boost[] {
    return this.boosts.filter((b) => b.until > now);
  }

  private addBoost(kind: BoostKind, multiplier: number, durationMs: number, now: number) {
    // 같은 종류는 시간만 새로 고친다
    this.boosts = this.boosts.filter((b) => b.kind !== kind && b.until > now);
    this.boosts.push({ kind, multiplier, until: now + durationMs });
    this.emit({ type: 'boost' });
  }

  /** 레전드 사연 엽서를 잡음: 일정 시간 청취자 배수 */
  claimLegend(now = Date.now()): void {
    this.advance(now);
    this.addBoost('legend', BALANCE.legend.multiplier, BALANCE.legend.durationMs, now);
    this.track('legend');
  }

  /**
   * 방송사고 결과. 복구하면 청취자·전파석 보너스, 놓치면 일정 시간 생산 감소.
   * 복구 보너스를 돌려준다.
   */
  resolveAccident(fixed: boolean, now = Date.now()): { listeners: number; stones: number } {
    this.advance(now);
    if (!fixed) {
      this.addBoost('accident', BALANCE.accident.penaltyMultiplier, BALANCE.accident.penaltyMs, now);
      return { listeners: 0, stones: 0 };
    }
    this.track('accident');
    const listeners = this.baseRate * BALANCE.accident.bonusSeconds;
    const stones = BALANCE.accident.bonusStones;
    this.addListeners(listeners);
    this.state.stones += stones;
    this.checkMilestones();
    this.commit();
    return { listeners, stones };
  }

  /** 레전드 사연 엽서가 오는 간격 배율 (장비 '레전드 사연 확률 %'만큼 자주 온다) */
  legendFrequency(): number {
    return 1 + equipBonuses(this.state).legendStoryPct / 100;
  }

  /**
   * 마지막 정산 이후 흐른 시간만큼 청취자를 지급한다.
   * 매 프레임 호출하며, 앱을 껐다 켜거나 탭을 오래 숨겼다 돌아온 경우도 같은 경로로 처리된다.
   */
  advance(now = Date.now()): void {
    const result = calcOfflineReward(this.state, now);
    const offline = result.rawElapsedMs >= BALANCE.offlineNoticeMinMs;
    if (offline) {
      // 장비 부가옵션 '오프라인 보상 %'
      result.earned *= 1 + equipBonuses(this.state).offlinePct / 100;
    } else {
      // 화면을 보고 있는 동안에만 레전드 사연·방송사고 배수가 걸린다
      result.earned *= this.multiplier(now);
    }
    this.updateBoosts(now);
    this.updateCorner(now);
    this.addPlacementBond(result.elapsedMs);
    if (refreshMissions(this.state, dayKey(new Date(now)))) this.emit({ type: 'changed' });
    this.addListeners(result.earned);
    this.state.lastTick = now;
    const ticketsBefore = this.state.box.tickets;
    regenTickets(this.state, now);
    this.advanceEvent(now, result.elapsedMs, offline);
    const gotStones = this.checkMilestones();
    if (this.state.box.tickets !== ticketsBefore && !offline) this.emit({ type: 'changed' });

    if (offline && result.earned > 0) {
      this.emit({ type: 'offline-reward', result });
      this.save(now);
    } else if (gotStones || now - this.lastSave >= BALANCE.autosaveIntervalMs) {
      this.save(now);
    }
  }

  /**
   * 시즌 이벤트 정산: 접속 미션, 방송 유지 시간, 방치 드롭(5분마다 확률), 끝난 이벤트의 재화 환산
   */
  private advanceEvent(now: number, elapsedMs: number, offline: boolean): void {
    const ev = activeEvent(this.state, now);
    if (ev) {
      const p = eventProgress(this.state, ev.id, now);
      const today = dayKey(new Date(now));
      if (p.daily.day !== today || !(p.daily.progress.login >= 1)) this.trackEv('login', 1, now);
      // 방송 1시간 유지: 누군가 배치되어 방송이 나가는 동안의 시간 (분)
      if (elapsedMs > 0 && Object.values(this.state.assignments).some(Boolean)) this.trackEv('onairMinutes', elapsedMs / 60000, now);
      const got = rollIdleCandy(this.state, now, Math.random);
      if (got > 0) this.emit({ type: 'event-candy', amount: got, source: offline ? 'offline' : 'idle' });
    }
    const conversions = convertEndedEvents(this.state, now);
    if (conversions.length) {
      this.emit({ type: 'event-ended', conversions });
      this.commit();
    }
  }

  private trackEv(kind: EventMissionKind, amount = 1, now = Date.now()): void {
    for (const id of trackEvent(this.state, kind, amount, now)) this.emit({ type: 'event-mission', id });
  }

  // ───────────── 시즌 이벤트 ─────────────

  /** 지금 진행 중인 이벤트 (개발자 옵션으로 강제 시작한 것 포함) */
  event(now = Date.now()): EventDef | undefined {
    return activeEvent(this.state, now);
  }

  eventProgress(id: string) {
    return eventProgress(this.state, id);
  }

  get eventClaimable(): number {
    return eventClaimable(this.state, Date.now());
  }

  /** 개발자 옵션: 날짜와 상관없이 이벤트 시작 (끄면 원래 날짜대로) */
  setEventForce(on: boolean): void {
    this.state.events.force = on;
    const ev = activeEvent(this.state, Date.now());
    if (ev) eventProgress(this.state, ev.id).idleAt = Date.now();
    this.commit();
  }

  claimEventMission(scope: 'daily' | 'total', id: string): EventRewards | null {
    const r = claimEventMission(this.state, scope, id, Date.now());
    if (r) this.commit();
    return r;
  }

  /** 이벤트 한정 모집 (U 사탕). 모자라거나 기간이 아니면 null */
  eventPull(count: 1 | 10, rng: Rng = Math.random): PullResult[] | null {
    this.advance();
    const results = eventPull(this.state, count, rng, Date.now());
    if (!results) return null;
    this.trackEv('eventPull', count);
    this.duplicateCardBond(results);
    const u = results.filter((r) => r.card.rarity === 'U').length;
    if (u) this.trackEv('uCard', u);
    this.commit();
    return results;
  }

  /** 교환소. 카드면 cardId로 고른 U 카드 */
  buyEventItem(itemId: string, cardId?: string): ReturnType<typeof buyShopItem> {
    const r = buyShopItem(this.state, itemId, Date.now(), cardId);
    if (!r) return null;
    if (r.card) {
      this.trackEv('uCard', 1);
      this.duplicateCardBond([r.card]);
    }
    this.commit();
    return r;
  }

  /** 이벤트 격파 상대 체력 */
  ghostHp(): number {
    const ev = this.event();
    return ev ? ghostHp(this.state, ev, this.attackPower) : 0;
  }

  /** 이벤트 격파 승리 */
  winGhost(): { candy: number; left: number } | null {
    const r = winGhost(this.state, Date.now());
    if (!r) return null;
    this.trackEv('ghostWin');
    this.trackEv('battleWin');
    this.commit();
    return r;
  }

  /**
   * 이 부원이 지금 입고 나올 의상 (스토리·대사·로비): 로비 캐릭터로 고른 카드 → 배치한 카드 순.
   * 의상이 없는 카드면 undefined (기본 모습)
   */
  outfitOf(memberId: string): string | undefined {
    const lobby = this.state.lobbyCard ? getCard(this.state.lobbyCard) : undefined;
    if (lobby?.member === memberId) return lobby.outfit;
    const id = Object.values(this.state.assignments).find((c) => c && getCard(c)?.member === memberId);
    return id ? getCard(id)?.outfit : undefined;
  }

  /** 로비 캐릭터로 고르기 (null이면 해제). 그 부원은 이 카드의 의상으로 나온다 */
  setLobbyCard(cardId: string | null): void {
    if (cardId && !this.state.cards[cardId]) return;
    this.state.lobbyCard = cardId;
    this.commit();
  }

  private addListeners(amount: number): void {
    const before = this.state.totalListeners;
    this.state.listeners += amount;
    this.state.totalListeners += amount;
    const opened = newlyUnlocked(before, this.state.totalListeners);
    if (opened.length) {
      this.emit({ type: 'unlock', items: opened });
      this.emit({ type: 'changed' });
    }
    for (const c of newlyOpenedChapters(before, this.state.totalListeners)) this.emit({ type: 'chapter', id: c.id });
  }

  /** 방송에 배치된 카드의 부원에게, 배치해 둔 시간만큼 호감도 */
  // ───────────── 카드 호감도 (전용 스토리) ─────────────

  /** 카드 호감도를 더하고, 레벨이 오르면 알린다 */
  addCardBond(cardId: string, xp: number, now = Date.now()): void {
    const level = addCardBond(this.state, cardId, xp, dayKey(new Date(now)));
    if (level) this.emit({ type: 'card-bond', cardId, level });
  }

  /** 같은 카드를 또 얻으면 그 카드 호감도 */
  private duplicateCardBond(results: { card: { id: string }; isNew: boolean }[]): void {
    for (const r of results) if (!r.isNew) this.addCardBond(r.card.id, BALANCE.cardBond.duplicateXp);
  }

  /** 카드 상세 '교감하기': 하루 정해진 횟수까지 호감도 + 한마디 (못 하면 null) */
  talkCard(cardId: string, now = Date.now()): { e: Expression; t: string } | null {
    const story = getCardStory(cardId);
    if (!story || !useCardTalk(this.state, cardId, dayKey(new Date(now)))) return null;
    this.addCardBond(cardId, BALANCE.cardBond.talkXp, now);
    this.commit();
    return pick(story.talks) ?? { e: 'smile', t: '……' };
  }

  /** 전용 스토리 선택지: 그 부원 몫의 호감도를 이 카드 호감도로 */
  applyCardChoiceXp(cardId: string, xp: Record<string, number> | undefined): void {
    if (!xp) return;
    const member = getCard(cardId)?.member;
    for (const [m, n] of Object.entries(xp)) if (m === member) this.addCardBond(cardId, n);
    this.commit();
  }

  private addPlacementBond(elapsedMs: number): void {
    if (elapsedMs <= 0) return;
    // 전용 스토리가 있는 카드는 그 카드 호감도도 (배치한 시간만큼)
    const cardXp = (elapsedMs / 60000) * BALANCE.cardBond.placementXpPerMin;
    for (const id of new Set(Object.values(this.state.assignments))) if (id && hasCardStory(id)) this.addCardBond(id, cardXp);
    const xp = (elapsedMs / 60000) * BALANCE.bond.placementXpPerMin;
    const members = new Set(Object.values(this.state.assignments).map((id) => (id ? getCard(id)?.member : undefined)));
    for (const m of members) if (m) this.addBond(m, xp);
  }

  /** 호감도를 더하고 레벨이 오르면 알린다 */
  addBond(memberId: string, xp: number): void {
    const b = this.state.bond[memberId];
    if (!b || xp <= 0) return;
    const before = bondLevel(b.xp);
    b.xp += xp;
    const after = bondLevel(b.xp);
    if (after > before) {
      this.emit({ type: 'bond-level', member: memberId, level: after });
      // 호감도가 오르면 그 부원에게서 다음 문자가 올 수 있다
      this.sendText(memberId);
      this.emit({ type: 'changed' });
    }
  }

  /** 스토리·이벤트 선택지의 호감도 반영 */
  applyChoiceXp(xp: Record<string, number> | undefined): void {
    if (!xp) return;
    for (const [m, n] of Object.entries(xp)) this.addBond(m, n);
    this.commit();
  }

  private track(kind: MissionKind, amount = 1): void {
    refreshMissions(this.state, dayKey(new Date()));
    for (const id of trackMission(this.state, kind, amount)) this.emit({ type: 'mission', id });
  }

  // ───────────── 부원 상호작용 ─────────────

  /** 대화: 지금 레벨까지 열린 대사 중 하나. 하루 일정 횟수까지 호감도도 준다 */
  talk(memberId: string): { e: Expression; t: string; xp: number } | null {
    const b = this.state.bond[memberId];
    if (!b || !ownsMember(this.state, memberId)) return null;
    refreshBondDay(b, dayKey(new Date()));
    const line = pick(unlockedLines(memberId, bondLevel(b.xp)));
    if (!line) return null;
    let xp = 0;
    if (b.talks < BALANCE.bond.talksPerDay) {
      b.talks += 1;
      xp = BALANCE.bond.talkXp;
      this.addBond(memberId, xp);
    }
    this.track('talk');
    this.commit();
    return { ...line, xp };
  }

  giftsLeft(memberId: string): number {
    const b = this.state.bond[memberId];
    if (!b) return 0;
    refreshBondDay(b, dayKey(new Date()));
    return Math.max(0, BALANCE.bond.giftsPerDay - b.gifts);
  }

  giftCost(giftId: string): number {
    return giftCost(giftId, this.state.towerLevel);
  }

  /** 선물: 청취자를 써서 호감도. 부원마다 하루 3번. 얻은 호감도 (실패하면 null) */
  gift(memberId: string, giftId: string): number | null {
    this.advance();
    const b = this.state.bond[memberId];
    const cost = this.giftCost(giftId);
    if (!b || !ownsMember(this.state, memberId) || this.giftsLeft(memberId) <= 0 || this.state.listeners < cost) return null;
    this.state.listeners -= cost;
    b.gifts += 1;
    const xp = giftXp(memberId, giftId);
    this.addBond(memberId, xp);
    this.track('gift');
    this.commit();
    return xp;
  }

  markEventSeen(memberId: string, level: number): void {
    const b = this.state.bond[memberId];
    if (b && !b.seenEvents.includes(level)) b.seenEvents.push(level);
    this.commit();
  }

  /** 스토리 화·엔딩을 끝까지 봤다 (key: "1-3", endingKey(id), 이벤트 스토리 "ev:<이벤트>:<화>") */
  markStorySeen(key: string): void {
    if (!this.state.story.seen.includes(key)) this.state.story.seen.push(key);
    // 이벤트 스토리: 그 이벤트에서 본 화 수로 누적 미션
    const ev = /^ev:([\w-]+):\d+$/.exec(key)?.[1];
    if (ev) {
      const seen = this.state.story.seen.filter((k) => k.startsWith(`ev:${ev}:`)).length;
      for (const id of setEventTotal(this.state, 'story', seen, Date.now())) this.emit({ type: 'event-mission', id });
    }
    this.commit();
  }

  setPlayerName(name: string): void {
    this.state.story.name = name.trim().slice(0, 8);
    this.commit();
  }

  // ───────────── 문자 ─────────────

  /** 새 문자 보내기 (부원 지정 안 하면 알아서) */
  sendText(memberId?: string): boolean {
    const who = deliverText(this.state, Date.now(), memberId);
    if (!who) return false;
    this.emit({ type: 'phone', member: who });
    return true;
  }

  /** 접속할 때: 마지막 접속 문자 이후 일정 시간이 지났으면 새 문자 */
  onSessionStart(now = Date.now()): void {
    if (now - this.state.phone.lastLoginText < BALANCE.phone.loginIntervalMs) return;
    this.state.phone.lastLoginText = now;
    this.sendText();
    this.commit();
  }

  reply(memberId: string, choiceIndex: number): number | null {
    const xp = replyText(this.state, memberId, choiceIndex, Date.now());
    if (xp === null) return null;
    this.addBond(memberId, xp);
    this.track('textReply');
    this.commit();
    return xp;
  }

  markRead(memberId: string): void {
    const t = this.state.phone.threads[memberId];
    if (t && t.unread) {
      t.unread = 0;
      this.commit();
    }
  }

  // ───────────── 일일 미션 ─────────────

  claimMission(id: string): boolean {
    const m = this.state.missions;
    if (!m.ids.includes(id) || m.claimed.includes(id) || !isMissionDone(this.state, id)) return false;
    m.claimed.push(id);
    this.state.stones += BALANCE.missions.stonesEach;
    this.commit();
    return true;
  }

  claimMissionBonus(): boolean {
    const m = this.state.missions;
    if (m.bonusClaimed || !m.ids.length || !m.ids.every((id) => m.claimed.includes(id))) return false;
    m.bonusClaimed = true;
    this.state.stones += BALANCE.missions.allClearStones;
    this.state.kits += BALANCE.missions.allClearKits;
    this.commit();
    return true;
  }

  get missionClaimable(): number {
    return claimableCount(this.state);
  }

  // ───────────── 튜닝 키트 ─────────────

  /** 부품 → 튜닝 키트 교환 */
  exchangeKits(count: number): boolean {
    const cost = BALANCE.kits.partsPerKit * count;
    if (count <= 0 || this.state.box.parts < cost) return false;
    this.state.box.parts -= cost;
    this.state.kits += count;
    this.commit();
    return true;
  }

  /** 끝난 배수를 정리하고, 바뀌었으면 알린다 */
  private updateBoosts(now: number): void {
    const before = this.boosts.length;
    this.boosts = this.boosts.filter((b) => b.until > now);
    if (this.boosts.length !== before) this.emit({ type: 'boost' });
  }

  /** 날짜가 바뀌면 오늘의 코너를 바꾼다 */
  private updateCorner(now: number): void {
    const today = todayCorner(now);
    if (today.day === this.state.corner.day) return;
    this.state.corner = today;
    this.emit({ type: 'corner', id: today.id });
    this.emit({ type: 'changed' });
  }

  /** 새로 넘긴 청취자 마일스톤 보상을 지급한다. 지급했으면 true */
  private checkMilestones(): boolean {
    const hits = newMilestones(this.state.milestonesReached, this.state.totalListeners);
    if (hits.length === 0) return false;
    const amount = hits.reduce((sum, h) => sum + h.reward, 0);
    this.state.stones += amount;
    this.state.milestonesReached += hits.length;
    this.emit({ type: 'milestone', threshold: hits[hits.length - 1].threshold, count: hits.length, stones: amount });
    this.sendText();
    this.emit({ type: 'changed' });
    return true;
  }

  /**
   * 슬롯에 카드를 배치한다. 같은 부원의 다른 카드가 다른 슬롯에 있으면 그 자리는 비워진다.
   */
  assign(slotId: SlotId, cardId: string | null): void {
    this.advance();
    const previous = this.state.assignments[slotId];
    if (previous === cardId) return;
    if (cardId !== null && (!this.state.cards[cardId] || !getCard(cardId))) return;
    if (cardId !== null && !slotUnlocked(this.state, slotId)) return;
    this.state.assignments = withAssignment(this.state, slotId, cardId);
    this.commit();
    this.emit({ type: 'assigned', slotId, cardId, previous });
  }

  get towerCost(): number {
    return towerUpgradeCost(this.state.towerLevel);
  }

  canUpgradeTower(): boolean {
    return this.state.listeners >= this.towerCost;
  }

  upgradeTower(): boolean {
    this.advance();
    const cost = this.towerCost;
    if (this.state.listeners < cost) return false;
    this.state.listeners -= cost;
    this.state.towerLevel += 1;
    const reward = towerUpReward(this.state.towerLevel);
    this.state.stones += reward;
    this.track('towerUp');
    this.commit();
    this.emit({ type: 'tower-up', level: this.state.towerLevel, reward });
    return true;
  }

  /** 이 모집을 지금 뽑을 수 있는지 (상시는 항상, 한정은 기간 중에만) */
  bannerOpen(bannerId: string, now = Date.now()): boolean {
    if (bannerId === STANDARD_BANNER) return true;
    const b = getBanner(bannerId);
    return !!b && isBannerActive(b, now);
  }

  pullCost(count: 1 | 10): number {
    return count === 10 ? BALANCE.gacha.tenCost : BALANCE.gacha.singleCost * count;
  }

  canPull(count: 1 | 10): boolean {
    return this.isUnlocked('gacha') && this.state.stones >= this.pullCost(count);
  }

  /** 뽑기. 전파석이 모자라거나 모집 기간이 아니면 null */
  pull(count: 1 | 10, rng?: Rng, bannerId = STANDARD_BANNER): PullResult[] | null {
    this.advance();
    const cost = this.pullCost(count);
    if (!this.isUnlocked('gacha') || this.state.stones < cost || !this.bannerOpen(bannerId)) return null;
    this.state.stones -= cost;
    const results = rollPulls(this.state, count, rng, Date.now(), bannerId);
    this.track('pull', count);
    this.duplicateCardBond(results);
    this.commit();
    return results;
  }

  // ───────────── 카드 강화 ─────────────

  /** 다음 레벨 강화 비용. 최대 레벨이거나 없는 카드면 null */
  enhanceCost(cardId: string): number | null {
    const owned = this.state.cards[cardId];
    const card = getCard(cardId);
    if (!owned || !card || owned.level >= maxCardLevel(owned.limitBreak)) return null;
    return enhanceCost(card, owned.level);
  }

  enhanceKitCost(cardId: string): number {
    return enhanceKits(this.state.cards[cardId]?.level ?? 1);
  }

  enhanceChance(cardId: string): number {
    return enhanceSuccessRate(this.state.cards[cardId]?.level ?? 1);
  }

  canEnhance(cardId: string): boolean {
    const cost = this.enhanceCost(cardId);
    return this.isUnlocked('enhance') && cost !== null && this.state.listeners >= cost && this.state.kits >= this.enhanceKitCost(cardId);
  }

  /**
   * 청취자 + 튜닝 키트를 써서 카드 레벨 +1 시도. 높은 레벨에서는 실패할 수 있다 (재료만 소모, 레벨 유지).
   * 시도할 수 없으면 null
   */
  enhance(cardId: string, rng: Rng = Math.random): EnhanceResult | null {
    this.advance();
    if (!this.canEnhance(cardId)) return null;
    const cost = this.enhanceCost(cardId)!;
    this.state.listeners -= cost;
    this.state.kits -= this.enhanceKitCost(cardId);
    const ok = rng() < this.enhanceChance(cardId);
    if (ok) this.state.cards[cardId].level += 1;
    this.track('enhance');
    this.commit();
    return ok ? 'success' : 'fail';
  }

  // ───────────── 라이벌 대결 ─────────────

  /** 대결 공격력 = 지금 초당 청취자 (레전드 사연 배수 포함) */
  get attackPower(): number {
    return this.rate;
  }

  /** 대결 1회 (승패 무관, 미션용) */
  recordBattle(): void {
    this.track('battle');
    this.commit();
  }

  /** 현재 스테이지 승리: 보상을 주고 다음 스테이지로. 이미 깬 스테이지면 null */
  winStage(stage: number): StageReward | null {
    if (stage !== this.state.dungeon.stage || !this.isUnlocked('dungeon')) return null;
    const reward = stageReward(stage);
    this.state.stones += reward.stones;
    this.state.box.tickets += reward.tickets;
    this.state.box.parts += reward.parts;
    this.state.kits += reward.kits;
    this.state.dungeon.stage += 1;
    this.trackEv('battleWin');
    this.commit();
    return reward;
  }

  // ───────────── 협찬 택배 ─────────────

  /** 택배를 연다. 티켓이 없거나 아직 고르지 않은 장비가 있으면 null */
  openBox(rng: Rng = Math.random): EquipItem | null {
    this.advance();
    const box = this.state.box;
    if (!this.isUnlocked('box') || box.pending || box.tickets <= 0) return null;
    // 가득 찬 상태에서 쓰면 그때부터 충전 시계가 돈다
    if (box.tickets >= BALANCE.tickets.max) box.ticketClock = Date.now();
    box.tickets -= 1;
    box.opened += 1;
    box.pending = rollEquip(box.level, rng, this.state.nextUid++);
    this.track('openBox');
    this.trackEv('openBox');
    // 이벤트 기간엔 낮은 확률로 '할로윈 택배' (사탕이 같이 들어 있다)
    const candy = rollBoxCandy(this.state, Date.now(), rng);
    this.lastBoxCandy = candy;
    if (candy > 0) this.emit({ type: 'event-candy', amount: candy, source: 'box' });
    this.commit();
    return box.pending;
  }

  /** 열린 장비를 장착한다. 같은 부위에 끼던 장비는 분해된다. 분해 보상을 돌려준다 */
  equipPending(): SalvageResult {
    const pending = this.state.box.pending;
    if (!pending) return { stones: 0, parts: 0 };
    const part = itemPart(pending);
    const old = this.state.equipment[part];
    // 분해 보상은 교체 전 장비 기준 옵션으로 계산
    const reward = old ? salvageReward(old, equipBonuses(this.state).salvagePct) : { stones: 0, parts: 0 };
    this.state.equipment[part] = pending;
    this.state.box.pending = null;
    this.grantSalvage(reward);
    this.commit();
    return reward;
  }

  /** 열린 장비를 분해한다 */
  salvagePending(): SalvageResult {
    const pending = this.state.box.pending;
    if (!pending) return { stones: 0, parts: 0 };
    const reward = salvageReward(pending, equipBonuses(this.state).salvagePct);
    this.state.box.pending = null;
    this.grantSalvage(reward);
    this.commit();
    return reward;
  }

  private grantSalvage(r: SalvageResult) {
    this.state.stones += r.stones;
    this.state.box.parts += r.parts;
  }

  get ticketCost(): number {
    return ticketCost(this.state.towerLevel);
  }

  canBuyTickets(count: number): boolean {
    return this.state.listeners >= this.ticketCost * count;
  }

  buyTickets(count: number): boolean {
    this.advance();
    const cost = this.ticketCost * count;
    if (this.state.listeners < cost) return false;
    this.state.listeners -= cost;
    this.state.box.tickets += count;
    this.commit();
    return true;
  }

  /** 다음 레벨까지 필요한 부품 (최대 레벨이면 null) */
  get boxLevelCost(): number | null {
    const lv = this.state.box.level;
    return lv >= maxBoxLevel() ? null : BALANCE.box.partsToNext[lv - 1];
  }

  canLevelUpBox(): boolean {
    const cost = this.boxLevelCost;
    return cost !== null && this.state.box.parts >= cost;
  }

  levelUpBox(): boolean {
    const cost = this.boxLevelCost;
    if (cost === null || this.state.box.parts < cost) return false;
    this.state.box.parts -= cost;
    this.state.box.level += 1;
    this.commit();
    this.emit({ type: 'box-level', level: this.state.box.level });
    return true;
  }

  get autoUnlocked(): boolean {
    return this.state.box.level >= BALANCE.box.autoUnlockLevel;
  }

  setAutoSettings(settings: AutoSettings): void {
    this.state.box.auto = { ...settings };
    this.commit();
  }

  reset(): void {
    resetSave();
    this.state = createInitialState(Date.now());
    this.commit();
  }

  save(now = Date.now()): void {
    saveGame(this.state);
    this.lastSave = now;
  }

  private commit(): void {
    this.save();
    this.emit({ type: 'changed' });
  }
}
