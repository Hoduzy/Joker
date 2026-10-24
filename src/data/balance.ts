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

  /** 협찬 택배 */
  box: {
    /**
     * 택배 레벨별 등급 확률(%). 한 줄이 한 레벨이고, 칸 순서는 equipment.json의 grades 순서
     * (일반, 고급, 희귀, 영웅, 전설, 신화). 각 줄의 합은 100이어야 한다.
     */
    rates: [
      [70, 25, 5, 0, 0, 0],
      [60, 30, 9, 1, 0, 0],
      [50, 33, 14, 3, 0, 0],
      [42, 34, 18, 5, 1, 0],
      [35, 34, 22, 7, 2, 0],
      [28, 33, 26, 10, 2.8, 0.2],
      [22, 31, 29, 13, 4.5, 0.5],
      [16, 29, 31, 17, 6, 1],
      [11, 26, 32, 21, 8, 2],
      [7, 22, 32, 25, 11, 3],
    ],
    /** 레벨 n → n+1에 필요한 부품 (배열 길이 = 최대 레벨 - 1) */
    partsToNext: [20, 40, 70, 110, 160, 220, 300, 400, 520],
    /** 택배 레벨 1당 장비 주 스탯 +8% (높은 레벨 택배일수록 좋은 장비) */
    statPerLevel: 0.08,
    /** 장비 전투력: 주 스탯 1당 */
    powerPerStat: 10,
    /** 자동 개봉 해금 레벨 */
    autoUnlockLevel: 5,
    /** 자동 개봉 간격(ms) */
    autoIntervalMs: 450,
  },

  /** 택배 티켓 */
  tickets: {
    regenMs: 60 * 1000,
    max: 50,
    /** 처음 시작(또는 이전 버전 세이브 변환) 시 지급 */
    start: 10,
    /** 청취자로 1장 구매 비용: base × growth^(송신탑 레벨-1) — 생산량과 같은 비율로 오른다 */
    buyBase: 100,
    buyGrowth: 1.3,
  },

  /** 오늘의 코너가 미는 슬롯의 파워 보너스 (+20%) */
  cornerBonus: 0.2,

  /** 레전드 사연 엽서: 화면을 가로질러 날아가고, 탭하면 일정 시간 청취자 배수 */
  legend: {
    minIntervalMs: 60 * 1000,
    maxIntervalMs: 180 * 1000,
    /** 화면을 가로지르는 시간 */
    flightMs: 9000,
    durationMs: 30 * 1000,
    multiplier: 3,
  },

  /** 방송사고: 노이즈가 뜨고 제한 시간 안에 탭하면 보너스, 놓치면 생산 감소 */
  accident: {
    minIntervalMs: 2 * 60 * 1000,
    maxIntervalMs: 5 * 60 * 1000,
    windowMs: 5000,
    penaltyMs: 20 * 1000,
    penaltyMultiplier: 0.5,
    /** 복구 보너스: 지금 생산량 기준 이 시간(초)만큼 청취자 + 전파석 */
    bonusSeconds: 60,
    bonusStones: 20,
  },

  /** 부원 말풍선 */
  bubbles: { minIntervalMs: 10 * 1000, maxIntervalMs: 20 * 1000, showMs: 4200 },

  /** 방송 채팅 */
  chat: { minIntervalMs: 1100, maxIntervalMs: 3000, maxMessages: 40 },

  /** 오프라인 보상 최대 누적 시간(ms) */
  offlineCapMs: 12 * 60 * 60 * 1000,
  /** 이 시간 이상 자리를 비웠을 때만 오프라인 보상 창을 띄운다(ms) */
  offlineNoticeMinMs: 60 * 1000,

  /** 자동 저장 간격(ms) */
  autosaveIntervalMs: 5000,
} as const;
