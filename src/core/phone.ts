import { MEMBERS } from '../data/members';
import { NARRATIVE } from '../data/narrative';
import { memberBondLevel } from './bond';
import type { GameState } from './state';

/** 이 부원에게서 지금 다음 문자가 올 수 있는지 (답장 대기 중이 아니고, 호감도 조건 충족) */
export function canReceive(state: GameState, memberId: string): boolean {
  const t = state.phone.threads[memberId];
  const convo = NARRATIVE.texts[memberId]?.[t?.next ?? 0];
  return !!t && t.pending === null && !!convo && memberBondLevel(state, memberId) >= convo.minLevel;
}

/**
 * 문자 한 대화를 보낸다. memberId를 안 주면 받을 수 있는 부원 중 진행이 가장 느린 부원.
 * 보낸 부원 id를 돌려준다 (보낼 게 없으면 null).
 */
export function deliverText(state: GameState, now: number, memberId?: string): string | null {
  const candidates = memberId ? [memberId] : MEMBERS.map((m) => m.id);
  const ready = candidates.filter((id) => canReceive(state, id));
  if (ready.length === 0) return null;
  ready.sort((a, b) => state.phone.threads[a].next - state.phone.threads[b].next || Math.random() - 0.5);
  const id = ready[0];
  const t = state.phone.threads[id];
  const convo = NARRATIVE.texts[id][t.next];
  for (const text of convo.msgs) t.log.push({ from: 'them', text, at: now });
  t.pending = t.next;
  t.unread += convo.msgs.length;
  return id;
}

/** 답장. 내 답장과 그에 대한 상대 문자를 기록하고 호감도를 돌려준다 */
export function replyText(state: GameState, memberId: string, choiceIndex: number, now: number): number | null {
  const t = state.phone.threads[memberId];
  if (!t || t.pending === null) return null;
  const convo = NARRATIVE.texts[memberId]?.[t.pending];
  const choice = convo?.choices[choiceIndex];
  if (!choice) return null;
  t.log.push({ from: 'me', text: choice.t, at: now });
  for (const text of choice.reply) t.log.push({ from: 'them', text, at: now + 1 });
  t.next = t.pending + 1;
  t.pending = null;
  t.log = t.log.slice(-200);
  return choice.xp;
}

export function unreadTotal(state: GameState): number {
  return Object.values(state.phone.threads).reduce((n, t) => n + t.unread, 0);
}

export function pendingConvo(state: GameState, memberId: string) {
  const t = state.phone.threads[memberId];
  return t && t.pending !== null ? NARRATIVE.texts[memberId]?.[t.pending] : undefined;
}
