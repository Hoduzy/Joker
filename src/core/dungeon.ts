import { BALANCE } from '../data/balance';
import raw from '../data/rivals.json';

/**
 * 라이벌 방송부 대결.
 * 스테이지마다 라이벌 방송부가 나오고, 그 방송부의 청취자 수가 체력이다.
 * 우리 공격력 = 지금 초당 청취자. 제한 시간 안에 체력을 다 빼앗으면 승리.
 * 라이벌 목록은 data/rivals.json (rivals: 일반, bosses: 5스테이지마다 나오는 보스)
 */
export interface RivalDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  taunt: string;
  defeat: string;
}

function validate(list: unknown, where: string): RivalDef[] {
  if (!Array.isArray(list) || list.length === 0) throw new Error(`rivals.json ${where}: 라이벌이 하나도 없습니다`);
  return list.map((r, i) => {
    if (typeof r?.id !== 'string' || typeof r?.name !== 'string') throw new Error(`rivals.json ${where}[${i}]: id와 name이 필요합니다`);
    return { id: r.id, name: r.name, emoji: r.emoji ?? '📻', color: r.color ?? '#888', taunt: r.taunt ?? '', defeat: r.defeat ?? '' };
  });
}

export const RIVALS = validate(raw.rivals, 'rivals');
export const BOSSES = validate(raw.bosses, 'bosses');

export function isBossStage(stage: number): boolean {
  return stage % BALANCE.dungeon.bossEvery === 0;
}

export function rivalFor(stage: number): RivalDef {
  if (isBossStage(stage)) return BOSSES[(stage / BALANCE.dungeon.bossEvery - 1) % BOSSES.length];
  return RIVALS[(stage - 1 - Math.floor(stage / BALANCE.dungeon.bossEvery)) % RIVALS.length];
}

/** 라이벌 체력 (= 빼앗아야 할 청취자 수) */
export function rivalHp(stage: number): number {
  const d = BALANCE.dungeon;
  const hp = d.hpBase * Math.pow(d.hpGrowth, stage - 1);
  return Math.round(isBossStage(stage) ? hp * d.bossHpMult : hp);
}

export interface StageReward {
  stones: number;
  tickets: number;
  parts: number;
  kits: number;
}

/** 스테이지 승리 보상: 전파석(뽑기) + 택배 티켓(택배) + 튜닝 키트(강화), 보스는 부품(택배 레벨)도 */
export function stageReward(stage: number): StageReward {
  const d = BALANCE.dungeon;
  const stones = d.stonesBase + d.stonesPerStage * stage;
  if (!isBossStage(stage)) return { stones, tickets: d.tickets, parts: 0, kits: d.kits };
  return { stones: stones * d.bossStoneMult, tickets: d.bossTickets, parts: d.bossParts, kits: d.bossKits };
}

/** 대결 점수: 공격력(초당 청취자) × 30초 + 탭 응원. 라이벌 청취자 이상이면 승리 */
export function battleScore(attackPerSec: number, taps: number): number {
  return attackPerSec * (BALANCE.dungeon.timeLimitMs / 1000) + taps * attackPerSec * BALANCE.dungeon.tapSeconds;
}

/** 제한 시간 동안 탭 없이 줄 수 있는 피해 */
export function expectedDamage(attackPerSec: number): number {
  return attackPerSec * (BALANCE.dungeon.timeLimitMs / 1000);
}
