const UNITS = ['', '만', '억', '조', '경', '해'];

/** 큰 수를 한국식 단위로 줄여 표시한다. 예: 12345 → "1.23만" */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const n = Math.floor(value);
  if (n < 10000) return n.toLocaleString('ko-KR');
  let unit = 0;
  let v = n;
  while (v >= 10000 && unit < UNITS.length - 1) {
    v /= 10000;
    unit++;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const text = v.toFixed(digits);
  return `${digits > 0 ? text.replace(/\.?0+$/, '') : text}${UNITS[unit]}`;
}

/** 초당 증가량처럼 소수가 의미 있는 값 */
export function formatRate(value: number): string {
  if (value < 10) return value.toFixed(1);
  return formatNumber(value);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${Math.floor(ms / 1000)}초`;
}
