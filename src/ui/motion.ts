/**
 * "연출 줄이기" (기기별 설정). 켜면 흔들림(화면·캐릭터)과 숨쉬기 움직임을 끄고, 섬광을 약하게 한다.
 * 기기의 '동작 줄이기' 설정이 켜져 있어도 같은 취급.
 */
const KEY = 'simya-bangsongbu/reduce-motion';

let reduced = read();
apply();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function apply() {
  document.documentElement.classList.toggle('reduce-motion', reducedMotion());
}

/** 사용자가 고른 값 (기기 설정과 상관없이) */
export function reduceMotionSetting(): boolean {
  return reduced;
}

export function reducedMotion(): boolean {
  return reduced || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function setReduceMotion(on: boolean): void {
  reduced = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // 무시
  }
  apply();
}
