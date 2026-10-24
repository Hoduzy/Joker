import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import type { SlotId } from '../data/slots';
import { listenersPerSecond, towerUpgradeCost, withAssignment } from './economy';
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
  | { type: 'corner'; id: string };

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

  constructor(now = Date.now()) {
    this.state = loadGame(now);
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
    this.addListeners(result.earned);
    this.state.lastTick = now;
    const ticketsBefore = this.state.box.tickets;
    regenTickets(this.state, now);
    const gotStones = this.checkMilestones();
    if (this.state.box.tickets !== ticketsBefore && !offline) this.emit({ type: 'changed' });

    if (offline && result.earned > 0) {
      this.emit({ type: 'offline-reward', result });
      this.save(now);
    } else if (gotStones || now - this.lastSave >= BALANCE.autosaveIntervalMs) {
      this.save(now);
    }
  }

  private addListeners(amount: number): void {
    this.state.listeners += amount;
    this.state.totalListeners += amount;
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
    this.commit();
    this.emit({ type: 'tower-up', level: this.state.towerLevel, reward });
    return true;
  }

  pullCost(count: 1 | 10): number {
    return count === 10 ? BALANCE.gacha.tenCost : BALANCE.gacha.singleCost * count;
  }

  canPull(count: 1 | 10): boolean {
    return this.state.stones >= this.pullCost(count);
  }

  /** 뽑기. 전파석이 모자라면 null */
  pull(count: 1 | 10, rng?: Rng): PullResult[] | null {
    this.advance();
    const cost = this.pullCost(count);
    if (this.state.stones < cost) return null;
    this.state.stones -= cost;
    const results = rollPulls(this.state, count, rng);
    this.commit();
    return results;
  }

  // ───────────── 협찬 택배 ─────────────

  /** 택배를 연다. 티켓이 없거나 아직 고르지 않은 장비가 있으면 null */
  openBox(rng: Rng = Math.random): EquipItem | null {
    this.advance();
    const box = this.state.box;
    if (box.pending || box.tickets <= 0) return null;
    // 가득 찬 상태에서 쓰면 그때부터 충전 시계가 돈다
    if (box.tickets >= BALANCE.tickets.max) box.ticketClock = Date.now();
    box.tickets -= 1;
    box.opened += 1;
    box.pending = rollEquip(box.level, rng, this.state.nextUid++);
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
