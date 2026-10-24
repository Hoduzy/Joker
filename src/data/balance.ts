import type { Rarity } from './cards';

/** 밸런스 수치는 전부 여기서 조정한다. */
export const BALANCE = {
  /** 슬롯 주 능력치 반영 비율 */
  mainStatWeight: 1,
  /** 슬롯 주 능력치 외 나머지 능력치 반영 비율 */
  subStatWeight: 0.2,
  /** 카드의 담당 슬롯에 배치했을 때 파워 보너스 (+30%) */
  slotBonus: 0.3,
  /** 능력치 1점당 초당 청취자 (송신탑 배율 적용 전) */
  listenersPerPower: 0.1,
  /** 4개 슬롯이 모두 찼을 때의 보너스 배율 */
  fullLineupBonus: 1.2,

  /** 송신탑 */
  tower: {
    baseCost: 50,
    costGrowth: 1.55,
    /** 레벨당 생산 배율 증가 (복리) */
    outputGrowth: 1.3,
  },

  /** 전파석 */
  stones: {
    /** 처음 시작(또는 이전 버전 세이브 변환) 시 환영 선물 — 10연차 1번 분량 */
    welcomeGift: 1600,
    /** 송신탑 레벨업 보상: base + perLevel × 새 레벨 */
    towerUpBase: 40,
    towerUpPerLevel: 10,
    /** 누적 청취자 마일스톤 보상: base + perStep × 단계 번호(0부터) */
    milestoneBase: 100,
    milestonePerStep: 60,
  },

  /** 뽑기 */
  gacha: {
    singleCost: 160,
    tenCost: 1600,
    rates: { R: 0.79, SR: 0.18, SSR: 0.03 } satisfies Record<Rarity, number>,
    /** 이 횟수 안에 SSR이 안 나오면 이번 뽑기가 SSR 확정 */
    pity: 80,
  },

  /** 돌파 */
  limitBreak: {
    max: 5,
    /** 돌파 1단계당 능력치 +12% */
    statBonusPerLevel: 0.12,
    /** 최대 돌파 카드를 또 뽑으면 전파석으로 돌려준다 */
    overflowRefund: { R: 20, SR: 60, SSR: 300 } satisfies Record<Rarity, number>,
  },

  /** 오프라인 보상 최대 누적 시간(ms) */
  offlineCapMs: 12 * 60 * 60 * 1000,
  /** 이 시간 이상 자리를 비웠을 때만 오프라인 보상 창을 띄운다(ms) */
  offlineNoticeMinMs: 60 * 1000,

  /** 자동 저장 간격(ms) */
  autosaveIntervalMs: 5000,
} as const;
