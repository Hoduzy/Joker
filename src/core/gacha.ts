import { BALANCE } from '../data/balance';
import { getBanner, STANDARD_BANNER, type BannerDef } from '../data/banners';
import { CARDS, cardsOfRarity, getCard, type CardDef, type Rarity } from '../data/cards';
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
  /** 한정 모집 픽업 카드인지 */
  pickup: boolean;
}

/** 한정 모집에서 등급이 정해졌을 때 픽업 카드가 나올 확률 */
export const PICKUP_SHARE = 0.5;

function pickupsOf(banner: BannerDef | undefined, rarity: Rarity): CardDef[] {
  return (banner?.pickups ?? []).map(getCard).filter((c): c is CardDef => !!c && c.rarity === rarity);
}

/** 모집별 천장 카운트 */
export function pityOf(state: GameState, bannerId: string): number {
  return bannerId === STANDARD_BANNER ? state.gacha.pity : (state.gacha.bannerPity[bannerId] ?? 0);
}

function setPity(state: GameState, bannerId: string, value: number) {
  if (bannerId === STANDARD_BANNER) state.gacha.pity = value;
  else state.gacha.bannerPity[bannerId] = value;
}

/** 확률에 따라 등급을 고른다 */
export function rollRarity(rng: Rng): Rarity {
  const { SSR, SR } = BALANCE.gacha.rates;
  const r = rng();
  if (r < SSR) return 'SSR';
  if (r < SSR + SR) return 'SR';
  return 'R';
}

/**
 * 등급이 정해진 뒤 카드 고르기.
 * 한정 모집이면 그 등급 픽업 카드가 50% (천장이면 100%), 나머지는 상시 카드 중에서.
 */
export function pickCard(rarity: Rarity, rng: Rng, banner?: BannerDef, forcePickup = false): { card: CardDef; pickup: boolean } {
  const pickups = pickupsOf(banner, rarity);
  if (pickups.length && (forcePickup || rng() < PICKUP_SHARE)) {
    return { card: pickups[Math.floor(rng() * pickups.length)], pickup: true };
  }
  // U는 상시 카드가 없다 (관리자 치트로 등급을 고정했을 때만 여기로 온다) → 모든 U 카드
  const pool = rarity === 'U' ? CARDS.filter((c) => c.rarity === 'U') : cardsOfRarity(rarity);
  if (pool.length === 0) throw new Error(`${rarity} 카드가 하나도 없습니다 (cards.json)`);
  return { card: pool[Math.floor(rng() * pool.length)], pickup: false };
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
export function pull(state: GameState, count: number, rng: Rng = Math.random, now = Date.now(), bannerId = STANDARD_BANNER): PullResult[] {
  const banner = bannerId === STANDARD_BANNER ? undefined : getBanner(bannerId);
  const results: PullResult[] = [];
  let hasSrPlus = false;
  for (let i = 0; i < count; i++) {
    let rarity: Rarity;
    const byPity = isPityPull(pityOf(state, bannerId));
    if (state.cheat?.nextRarity) rarity = state.cheat.nextRarity;
    else if (byPity) rarity = 'SSR';
    else {
      rarity = rollRarity(rng);
      if (count >= 10 && i === count - 1 && !hasSrPlus && rarity === 'R') rarity = 'SR';
    }
    if (rarity !== 'R') hasSrPlus = true;
    setPity(state, bannerId, rarity === 'SSR' ? 0 : pityOf(state, bannerId) + 1);
    state.gacha.totalPulls += 1;
    // 한정 모집 천장은 픽업 SSR 확정
    const picked = pickCard(rarity, rng, banner, byPity && !!banner);
    results.push({ ...grantCard(state, picked.card, byPity, now), pickup: picked.pickup });
  }
  return results;
}

/** 카드 지급: 새 카드면 획득, 중복이면 돌파 +1, 최대 돌파면 전파석 환원 */
export function grantCard(state: GameState, card: CardDef, byPity = false, now = Date.now()): Omit<PullResult, 'pickup'> {
  const owned = state.cards[card.id];
  if (!owned) {
    state.cards[card.id] = { limitBreak: 0, level: 1, obtainedAt: now };
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

/** 확률표용: 등급별 확률, 픽업 카드와 일반 카드 1장당 확률 */
export function rateTable(bannerId = STANDARD_BANNER) {
  const banner = bannerId === STANDARD_BANNER ? undefined : getBanner(bannerId);
  return (['SSR', 'SR', 'R'] as Rarity[]).map((rarity) => {
    const cards = cardsOfRarity(rarity);
    const pickups = pickupsOf(banner, rarity);
    const rate = BALANCE.gacha.rates[rarity];
    const pickupRate = pickups.length ? rate * PICKUP_SHARE : 0;
    const normalRate = rate - pickupRate;
    return {
      rarity,
      rate,
      pickups,
      perPickup: pickups.length ? pickupRate / pickups.length : 0,
      cards,
      perCard: cards.length ? normalRate / cards.length : 0,
    };
  });
}

export function pullsUntilPity(state: GameState, bannerId = STANDARD_BANNER): number {
  return BALANCE.gacha.pity - pityOf(state, bannerId);
}

