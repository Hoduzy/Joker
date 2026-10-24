/** 모든 UI 조각의 공통 형태 */
export interface Component {
  el: HTMLElement;
  /** 배치·레벨 등 구조가 바뀌었을 때 다시 그린다 */
  render(): void;
  /** 매 프레임 숫자처럼 자주 바뀌는 부분만 갱신한다 */
  tick?(): void;
}
