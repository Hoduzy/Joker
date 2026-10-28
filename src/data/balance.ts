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
  listenersPerPower: 0.02,
  /** 4개 슬롯이 모두 찼을 때의 보너스 배율 */
  fullLineupBonus: 1.2,

  /** 송신탑 */
  tower: {
    baseCost: 60,
    costGrowth: 1.66,
    /** 레벨당 생산 배율 증가 (복리) */
    outputGrowth: 1.22,
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
    /** 상시 모집에서 U는 절대 나오지 않는다 (이벤트 한정 모집·교환소 전용) */
    rates: { R: 0.79, SR: 0.18, SSR: 0.03, U: 0 } satisfies Record<Rarity, number>,
    /** 이 횟수 안에 SSR이 안 나오면 이번 뽑기가 SSR 확정 */
    pity: 80,
  },

  /** 돌파 */
  limitBreak: {
    max: 5,
    /** 돌파 1단계당 능력치 +6% */
    statBonusPerLevel: 0.06,
    /** 최대 돌파 카드를 또 뽑으면 전파석으로 돌려준다 */
    overflowRefund: { R: 20, SR: 60, SSR: 300, U: 800 } satisfies Record<Rarity, number>,
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
    buyGrowth: 1.22,
  },

  /**
   * 해금: 누적 청취자가 이 수를 넘으면 열린다 (갓 생긴 방송부처럼 DJ 한 자리로 시작)
   * slots: 방송 자리, 나머지: 기능
   */
  unlocks: {
    slots: { dj: 0, engineer: 300, writer: 3000, guest: 30000 },
    gacha: 100,
    box: 1000,
    enhance: 3000,
    legend: 3000,
    dungeon: 10000,
    missions: 10000,
    accident: 30000,
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

  /**
   * 방송사고: 전파가 원래 주파수에서 벗어난다. 다이얼을 돌려 되돌리고, 신호가 초록인 채로 holdMs 버티면 복구.
   * 빨리 잡을수록 청취자 배수 (완벽 ×3 / 복구 ×2 / 겨우 복구 없음), 시간 안에 못 잡으면 생산 절반
   */
  accident: {
    minIntervalMs: 2 * 60 * 1000,
    maxIntervalMs: 5 * 60 * 1000,
    /** 원래 방송 주파수 (MHz) */
    frequency: 89.7,
    /** 다이얼 범위 */
    dialMin: 84,
    dialMax: 96,
    /** 다이얼 한 바퀴 = 몇 MHz */
    mhzPerTurn: 4,
    /** 벗어나는 폭: offsetMin ~ (offsetMax + 송신탑 레벨당 offsetPerTower, 최대 offsetCap) */
    offsetMin: 0.5,
    offsetMax: 3,
    offsetPerTower: 0.08,
    offsetCap: 5,
    /** 이 차이(MHz) 안이면 신호 초록 */
    tolerance: 0.1,
    /** 신호가 들리기 시작하는 차이 (이보다 멀면 노이즈뿐) */
    hearRange: 1.2,
    /** 초록으로 버텨야 하는 시간 */
    holdMs: 1000,
    timeLimitMs: 10_000,
    /** 미래(기술 담당)를 엔지니어 자리에 배치하면 제한 시간 + 힌트 */
    miraeBonusMs: 3000,
    /** 불안정 신호(주파수가 혼자 흔들림) 확률: 송신탑 레벨당, 최대 */
    unstablePerTower: 0.04,
    unstableMax: 0.5,
    /** 잡기 시작(초록이 된 순간)까지 걸린 시간으로 판정 */
    perfectMs: 3000,
    goodMs: 6000,
    perfect: { multiplier: 3, durationMs: 30 * 1000 },
    good: { multiplier: 2, durationMs: 30 * 1000 },
    penaltyMs: 20 * 1000,
    penaltyMultiplier: 0.5,
  },

  /** 부원 말풍선 */
  bubbles: { minIntervalMs: 10 * 1000, maxIntervalMs: 20 * 1000, showMs: 4200 },

  /** 방송 채팅 */
  chat: { minIntervalMs: 1100, maxIntervalMs: 3000, maxMessages: 40 },

  /** 카드 강화 (청취자를 써서 카드 레벨업) */
  enhance: {
    /** 최대 레벨 = base + perLimitBreak × 돌파 단계 */
    maxLevelBase: 20,
    maxLevelPerLimitBreak: 4,
    /** 레벨 1당 능력치 +2% */
    statPerLevel: 0.02,
    /** 레벨 n → n+1 비용 = base[등급] × growth^(n-1) */
    costBase: { R: 50, SR: 90, SSR: 150, U: 220 } satisfies Record<Rarity, number>,
    costGrowth: 1.22,
    /** 튜닝 키트: 1 + (레벨-1)/10 개 */
    kitsPerTenLevels: 1,
    /** 성공 확률: 이 레벨까지 100%, 그다음 레벨마다 -3% (최저 60%). 실패해도 레벨은 안 내려간다 */
    safeUntil: 9,
    failStep: 0.03,
    minSuccess: 0.6,
  },

  /** 라이벌 방송부 대결 (던전) */
  dungeon: {
    /** 라이벌 청취자(=체력): base × growth^(스테이지-1), 5스테이지마다 보스 */
    hpBase: 500,
    hpGrowth: 1.32,
    bossEvery: 5,
    bossHpMult: 2,
    /** 제한 시간 */
    timeLimitMs: 30 * 1000,
    /** 라이벌을 탭하면 '응원 공격': 지금 공격력(초당 청취자) × 이 값 */
    tapDamage: 0.15,
    /** 승리 보상 (스테이지마다 한 번) */
    stonesBase: 40,
    stonesPerStage: 8,
    bossStoneMult: 3,
    tickets: 3,
    kits: 1,
    bossTickets: 8,
    bossKits: 3,
    bossParts: 30,
    /** 대결 연출 길이 */
    showMs: 4000,
    /** 연출 중 라이벌을 탭하면: 공격력 × 이 초만큼 추가 */
    tapSeconds: 0.5,
  },

  /** 호감도 (부원별) */
  bond: {
    maxLevel: 10,
    /** 레벨 n에 필요한 누적 호감도 (index 0 = 레벨 1) */
    xpTable: [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200],
    /** 방송에 배치해 둔 1분당 호감도 (오프라인 포함, 오프라인 상한 적용) */
    placementXpPerMin: 1,
    /** 호감도 레벨 1당 그 부원 카드 능력치 +2% */
    statPerLevel: 0.02,
    /** 대화: 하루 이 횟수까지 호감도를 준다 */
    talkXp: 3,
    talksPerDay: 5,
    /** 선물: 부원마다 하루 3번 */
    giftsPerDay: 3,
    /** 선물 비용(청취자) = 기본 × 선물 배율 × growth^(송신탑 레벨-1), 좋아하는 선물은 호감도 2배 */
    giftCostBase: 80,
    giftCostGrowth: 1.22,
    gifts: [
      { id: 'snack', name: '편의점 간식', emoji: '🍙', costMult: 1, xp: 30 },
      { id: 'drink', name: '따뜻한 캔음료', emoji: '☕', costMult: 2, xp: 55 },
      { id: 'goods', name: '방송부 굿즈', emoji: '🎀', costMult: 4, xp: 100 },
    ],
    /** 이 레벨에 단둘이 이벤트가 열린다 */
    eventLevels: [2, 4, 6, 8, 10],
  },

  /**
   * 카드 호감도: 전용 스토리가 있는 카드(U 등급 등)만. 부원 호감도와 따로 쌓인다.
   * 이 카드를 방송에 배치한 시간 + 하루 몇 번 '교감하기' + 같은 카드를 또 얻으면(돌파) + 전용 스토리 선택지
   */
  cardBond: {
    maxLevel: 7,
    /** 레벨 n에 필요한 누적 호감도 (index 0 = 레벨 1) */
    xpTable: [0, 60, 150, 280, 450, 680, 960],
    /** 이 카드를 배치해 둔 1분당 (오프라인 포함) */
    placementXpPerMin: 0.2,
    talkXp: 15,
    talksPerDay: 3,
    /** 같은 카드를 또 얻었을 때 */
    duplicateXp: 60,
    /** 레벨 1당 이 카드 능력치 +3% */
    statPerLevel: 0.03,
  },

  /** 튜닝 키트 (카드 강화 재료) */
  kits: {
    start: 10,
    /** 택배 분해 부품 이만큼 → 키트 1개 */
    partsPerKit: 10,
  },

  /** 일일 미션 */
  missions: {
    perDay: 5,
    stonesEach: 20,
    allClearStones: 150,
    allClearKits: 3,
  },

  /** 문자: 마지막 접속 문자 이후 이 시간이 지나면 접속할 때 새 문자가 온다 */
  phone: { loginIntervalMs: 3 * 60 * 60 * 1000 },

  /** 오프라인 보상 최대 누적 시간(ms) */
  offlineCapMs: 12 * 60 * 60 * 1000,
  /** 이 시간 이상 자리를 비웠을 때만 오프라인 보상 창을 띄운다(ms) */
  offlineNoticeMinMs: 60 * 1000,

  /** 자동 저장 간격(ms) */
  autosaveIntervalMs: 5000,
} as const;
