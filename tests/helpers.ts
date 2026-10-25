import { Game } from '../src/core/game';
import { newMilestones } from '../src/core/rewards';
import { CARDS } from '../src/data/cards';

/** 해금이 전부 끝난 상태의 게임 (마일스톤 보상은 이미 받은 것으로) */
export function openGame(): Game {
  const g = new Game();
  g.state.totalListeners = 1e9;
  g.state.milestonesReached = newMilestones(0, 1e9).length;
  // 부원 다섯 명의 R 카드를 모두 가진 상태로
  for (const c of CARDS) if (c.rarity === 'R') g.state.cards[c.id] ??= { limitBreak: 0, level: 1, obtainedAt: 0 };
  return g;
}
