import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import type { GameState } from './state';

/**
 * 방송사고 = 전파 이탈. 다이얼로 원래 주파수(89.7)를 다시 잡는 미니 게임의 규칙.
 * 화면(ui/tuning.ts)은 여기서 정한 시작 주파수·제한 시간·판정을 따른다.
 */

export type AccidentGrade = 'perfect' | 'good' | 'barely' | 'fail';

export interface AccidentSetup {
  /** 맞춰야 하는 주파수 */
  target: number;
  /** 시작 주파수 (target에서 offsetMin~max만큼 위나 아래) */
  start: number;
  /** 주파수가 혼자 흔들리는 '불안정 신호' */
  unstable: boolean;
  timeLimitMs: number;
  /** 미래가 엔지니어 자리에 있어 힌트를 준다 */
  miraeHelps: boolean;
}

const A = () => BALANCE.accident;

/** 미래 카드가 엔지니어 자리에 배치되어 있는지 */
export function miraeOnEngineer(state: GameState): boolean {
  const id = state.assignments.engineer;
  return !!id && getCard(id)?.member === 'mirae';
}

/** 송신탑 레벨에 따른 최대 이탈 폭 */
export function maxOffset(towerLevel: number): number {
  return Math.min(A().offsetCap, A().offsetMax + A().offsetPerTower * (towerLevel - 1));
}

export function unstableChance(towerLevel: number): number {
  return Math.min(A().unstableMax, A().unstablePerTower * (towerLevel - 1));
}

export function rollAccident(state: GameState, rng: () => number = Math.random): AccidentSetup {
  const a = A();
  const offset = a.offsetMin + rng() * (maxOffset(state.towerLevel) - a.offsetMin);
  const dir = rng() < 0.5 ? -1 : 1;
  const start = Math.round((a.frequency + dir * offset) * 10) / 10;
  const miraeHelps = miraeOnEngineer(state);
  return {
    target: a.frequency,
    start: Math.min(a.dialMax, Math.max(a.dialMin, start)),
    unstable: rng() < unstableChance(state.towerLevel),
    timeLimitMs: a.timeLimitMs + (miraeHelps ? a.miraeBonusMs : 0),
    miraeHelps,
  };
}

/** 신호 세기 0~1: 맞을수록 1 (hearRange 밖이면 0) */
export function signalStrength(freq: number, target: number): number {
  return Math.max(0, 1 - Math.abs(freq - target) / A().hearRange);
}

export function isLocked(freq: number, target: number): boolean {
  return Math.abs(freq - target) <= A().tolerance + 1e-9;
}

/**
 * 판정: 초록으로 잡기 시작한 시각(사고 시작부터 ms)으로. null이면 실패.
 * 미래 보너스로 늘어난 제한 시간 안이면 '겨우 복구'
 */
export function gradeAccident(lockedAtMs: number | null, timeLimitMs: number): AccidentGrade {
  if (lockedAtMs === null || lockedAtMs > timeLimitMs) return 'fail';
  if (lockedAtMs <= A().perfectMs) return 'perfect';
  if (lockedAtMs <= A().goodMs) return 'good';
  return 'barely';
}

/** 판정별 청취자 배수 (없으면 null) */
export function gradeBoost(grade: AccidentGrade): { multiplier: number; durationMs: number } | null {
  if (grade === 'perfect') return A().perfect;
  if (grade === 'good') return A().good;
  if (grade === 'fail') return { multiplier: A().penaltyMultiplier, durationMs: A().penaltyMs };
  return null;
}

/** 미래 힌트: 지금 주파수에서 어느 쪽으로 얼마나 (오른쪽 = 주파수 올리기) */
export function tuneHint(freq: number, target: number): 'far-right' | 'right' | 'far-left' | 'left' | 'hold' {
  const d = target - freq;
  if (Math.abs(d) <= A().tolerance) return 'hold';
  if (d > 0) return d > 1 ? 'far-right' : 'right';
  return -d > 1 ? 'far-left' : 'left';
}
