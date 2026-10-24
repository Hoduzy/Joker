import { BALANCE } from '../data/balance';
import { cardsOfRarity, type CardDef, type Rarity } from '../data/cards';
import type { GameState } from './state';

/** 0 이상 1 미만의 난수를 돌려주는 함수. 테스트에서는 시드 고정 난수를 넣는다. */
export type Rng = () => number;

export interface PullResult {
  card: CardDef;
  /** 처음 얻은 카드인지 */
  isNew: boolean;
  /** 이 결과를 반영한 뒤의 돌파 단계 */
  limitBreak: number;
  /** 최대 돌파를 넘어서 전파석으로 돌려받은 양 (없으면 0) */
  refund: number;
  /** 천장으로 확정된 SSR인지 */
  byPity: boolean;
}

/** 확률에 따라 등급을 고른다 */
export function rollRarity(rng: Rng): Rarity {
  const { SSR, SR } = BALANCE.gacha.rates;
  const r = rng();
  if (r < SSR) return 'SSR';
  if (r < SSR + SR) return 'SR';
  return 'R';
}

export function pickCard(rarity: Rarity, rng: Rng): CardDef {
  const pool = cardsOfRarity(rarity);
  if (pool.length === 0) throw new Error(`${rarity} 카드가 하나도 없습니다 (cards.json)`);
  return pool[Math.floor(rng() * pool.length)];
}

/** 이번 뽑기가 천장(SSR 확정)인지: 지금까지 SSR 없이 pity-1회를 뽑았으면 다음 1회가 확정 */
export function isPityPull(pity: number): boolean {
  return pity + 1 >= BALANCE.gacha.pity;
}

/**
 * count회 뽑고 결과를 state에 반영한다 (전파석 차감은 호출하는 쪽에서).
 * - 천장: 마지막 SSR 이후 80번째 뽑기는 SSR 확정
 * - 10연차: 앞 9장에 SR 이상이 없으면 10번째는 SR 이상 확정
 */
export function pull(state: GameState, count: number, rng: Rng = Math.random, now = Date.now()): PullResult[] {
  const results: PullResult[] = [];
  let hasSrPlus = false;
  for (let i = 0; i < count; i++) {
    let rarity: Rarity;
    const byPity = isPityPull(state.gacha.pity);
    if (byPity) rarity = 'SSR';
    else {
      rarity = rollRarity(rng);
      if (count >= 10 && i === count - 1 && !hasSrPlus && rarity === 'R') rarity = 'SR';
    }
    if (rarity !== 'R') hasSrPlus = true;
    state.gacha.pity = rarity === 'SSR' ? 0 : state.gacha.pity + 1;
    state.gacha.totalPulls += 1;
    results.push(grantCard(state, pickCard(rarity, rng), byPity, now));
  }
  return results;
}

/** 카드 지급: 새 카드면 획득, 중복이면 돌파 +1, 최대 돌파면 전파석 환원 */
export function grantCard(state: GameState, card: CardDef, byPity = false, now = Date.now()): PullResult {
  const owned = state.cards[card.id];
  if (!owned) {
    state.cards[card.id] = { limitBreak: 0, obtainedAt: now };
    return { card, isNew: true, limitBreak: 0, refund: 0, byPity };
  }
  if (owned.limitBreak < BALANCE.limitBreak.max) {
    owned.limitBreak += 1;
    return { card, isNew: false, limitBreak: owned.limitBreak, refund: 0, byPity };
  }
  const refund = BALANCE.limitBreak.overflowRefund[card.rarity];
  state.stones += refund;
  return { card, isNew: false, limitBreak: owned.limitBreak, refund, byPity };
}

/** 확률표용: 등급별 확률과 카드 1장당 확률 */
export function rateTable() {
  return (['SSR', 'SR', 'R'] as Rarity[]).map((rarity) => {
    const cards = cardsOfRarity(rarity);
    const rate = BALANCE.gacha.rates[rarity];
    return { rarity, rate, perCard: cards.length ? rate / cards.length : 0, cards };
  });
}

export function pullsUntilPity(state: GameState): number {
  return BALANCE.gacha.pity - state.gacha.pity;
}

