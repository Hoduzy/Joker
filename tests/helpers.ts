import { Game } from '../src/core/game';
import { newMilestones } from '../src/core/rewards';

/** 해금이 전부 끝난 상태의 게임 (마일스톤 보상은 이미 받은 것으로) */
export function openGame(): Game {
  const g = new Game();
  g.state.totalListeners = 1e9;
  g.state.milestonesReached = newMilestones(0, 1e9).length;
  return g;
}
