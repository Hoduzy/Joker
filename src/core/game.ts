import { BALANCE } from '../data/balance';
import type { SlotId } from '../data/slots';
import { listenersPerSecond, towerUpgradeCost } from './economy';
import { calcOfflineReward, type OfflineResult } from './offline';
import { loadGame, resetSave, saveGame } from './save';
import { createInitialState, type GameState } from './state';

export type GameEvent =
  /** 배치·레벨 등 화면 구조가 바뀌는 변화 */
  | { type: 'changed' }
  /** 오랫동안 자리를 비웠다가 돌아와서 보상을 받음 */
  | { type: 'offline-reward'; result: OfflineResult };

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

    if (result.rawElapsedMs >= BALANCE.offlineNoticeMinMs && result.earned > 0) {
      this.emit({ type: 'offline-reward', result });
      this.save(now);
    } else if (now - this.lastSave >= BALANCE.autosaveIntervalMs) {
      this.save(now);
    }
  }

  private addListeners(amount: number): void {
    this.state.listeners += amount;
    this.state.totalListeners += amount;
  }

  /** 슬롯에 부원을 배치한다. 다른 슬롯에 있던 부원이면 그 자리는 비워진다. */
  assign(slotId: SlotId, memberId: string | null): void {
    this.advance();
    const a = this.state.assignments;
    if (memberId !== null) {
      if (!this.state.ownedMembers.includes(memberId)) return;
      for (const key of Object.keys(a) as SlotId[]) {
        if (a[key] === memberId) a[key] = null;
      }
    }
    a[slotId] = memberId;
    this.commit();
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
    this.commit();
    return true;
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
