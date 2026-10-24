/** 밸런스 수치는 전부 여기서 조정한다. */
export const BALANCE = {
  /** 슬롯 주 능력치 반영 비율 */
  mainStatWeight: 1,
  /** 슬롯 주 능력치 외 나머지 능력치 반영 비율 */
  subStatWeight: 0.2,
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

  /** 오프라인 보상 최대 누적 시간(ms) */
  offlineCapMs: 12 * 60 * 60 * 1000,
  /** 이 시간 이상 자리를 비웠을 때만 오프라인 보상 창을 띄운다(ms) */
  offlineNoticeMinMs: 60 * 1000,

  /** 자동 저장 간격(ms) */
  autosaveIntervalMs: 5000,
} as const;
