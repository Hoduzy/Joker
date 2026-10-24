import { BALANCE } from '../data/balance';

/**
 * 누적 청취자 마일스톤: 100, 300, 1천, 3천, 1만, 3만 … (1·3 × 10의 거듭제곱)
 * step은 0부터 시작한다.
 */
export function milestoneThreshold(step: number): number {
  return Math.pow(10, 2 + Math.floor(step / 2)) * (step % 2 === 0 ? 1 : 3);
}

export function milestoneReward(step: number): number {
  return BALANCE.stones.milestoneBase + BALANCE.stones.milestonePerStep * step;
}

/** 송신탑이 newLevel이 되었을 때 받는 전파석 */
export function towerUpReward(newLevel: number): number {
  return BALANCE.stones.towerUpBase + BALANCE.stones.towerUpPerLevel * newLevel;
}

export interface MilestoneHit {
  step: number;
  threshold: number;
  reward: number;
}

/** reached개를 달성한 상태에서 totalListeners까지 새로 넘긴 마일스톤들 */
export function newMilestones(reached: number, totalListeners: number): MilestoneHit[] {
  const hits: MilestoneHit[] = [];
  for (let step = reached; milestoneThreshold(step) <= totalListeners; step++) {
    hits.push({ step, threshold: milestoneThreshold(step), reward: milestoneReward(step) });
  }
  return hits;
}
