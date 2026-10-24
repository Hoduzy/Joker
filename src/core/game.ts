import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import type { SlotId } from '../data/slots';
import { listenersPerSecond, towerUpgradeCost, withAssignment } from './economy';
import { pull as rollPulls, type PullResult, type Rng } from './gacha';
import { calcOfflineReward, type OfflineResult } from './offline';
import { newMilestones, towerUpReward } from './rewards';
import { loadGame, resetSave, saveGame } from './save';
import { createInitialState, type GameState } from './state';

export type GameEvent =
  /** 배치·레벨·카드 등 화면 구조가 바뀌는 변화 */
  | { type: 'changed' }
  /** 오랫동안 자리를 비웠다가 돌아와서 보상을 받음 */
  | { type: 'offline-reward'; result: OfflineResult }
  /** 슬롯 배치가 바뀜. cardId가 null이면 비움, previous는 원래 있던 카드 */
  | { type: 'assigned'; slotId: SlotId; cardId: string | null; previous: string | null }
  | { type: 'tower-up'; level: number; reward: number }
  /** 전파석 획득 (마일스톤 등). 알림 표시용 */
  | { type: 'stones'; amount: number; reason: string };

type Listener = (event: GameEvent) => void;

/**
 * 게임 상태와 모든 상태 변경 동작을 소유한다.
 * UI는 여기 있는 메서드만 호출하고, 이벤트를 구독해서 화면을 갱신한다.
 */
export class Game {
  state: GameState;
  private listeners = new Set<Listener>();
  private lastSave = 0;

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

  get rate(): number {
    return listenersPerSecond(this.state);
  }

  /**
   * 마지막 정산 이후 흐른 시간만큼 청취자를 지급한다.
   * 매 프레임 호출하며, 앱을 껐다 켜거나 탭을 오래 숨겼다 돌아온 경우도 같은 경로로 처리된다.
   */
  advance(now = Date.now()): void {
    const result = calcOfflineReward(this.state, now);
    this.addListeners(result.earned);
    this.state.lastTick = now;
    const gotStones = this.checkMilestones();

    if (result.rawElapsedMs >= BALANCE.offlineNoticeMinMs && result.earned > 0) {
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

  /** 새로 넘긴 청취자 마일스톤 보상을 지급한다. 지급했으면 true */
  private checkMilestones(): boolean {
    const hits = newMilestones(this.state.milestonesReached, this.state.totalListeners);
    if (hits.length === 0) return false;
    const amount = hits.reduce((sum, h) => sum + h.reward, 0);
    this.state.stones += amount;
    this.state.milestonesReached += hits.length;
    const last = hits[hits.length - 1].threshold;
    const reason = hits.length === 1 ? `누적 청취자 ${last.toLocaleString('ko-KR')}명 달성` : `청취자 마일스톤 ${hits.length}개 달성`;
    this.emit({ type: 'stones', amount, reason });
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
