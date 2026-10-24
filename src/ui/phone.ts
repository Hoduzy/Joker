import type { Game } from '../core/game';
import { pendingConvo } from '../core/phone';
import { getMember, MEMBERS } from '../data/members';
import { NARRATIVE } from '../data/narrative';
import { h, memberFace, onTap } from './dom';
import { popNumber } from './fx';
import { sfx } from './sfx';

const time = (at: number) => {
  const d = new Date(at);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 문자(메신저) 화면. memberId를 주면 그 대화방부터 연다 */
export function openPhone(game: Game, memberId?: string): void {
  document.querySelector('.phone')?.remove();
  const screen = h('div', { class: 'phone__screen' });
  const closeBtn = h('button', { class: 'phone__close', type: 'button', 'aria-label': '닫기' }, '✕');
  const root = h('div', { class: 'phone', role: 'dialog', 'aria-modal': 'true', 'aria-label': '문자' }, h('div', { class: 'phone__body' }, screen, closeBtn));
  document.body.append(root);
  let current: string | null = memberId ?? null;
  let replied = 0; // 방금 답장한 뒤 새로 붙은 말풍선 수 (차례로 나타나게)

  const close = () => {
    off();
    root.remove();
  };
  onTap(closeBtn, close);
  root.addEventListener('click', (e) => e.target === root && close());

  function renderList() {
    const rows = MEMBERS.map((m) => {
      const t = game.state.phone.threads[m.id];
      const last = t?.log[t.log.length - 1];
      const row = h(
        'button',
        { class: `phone__row${t?.unread ? ' is-unread' : ''}`, type: 'button', disabled: !last },
        memberFace(m, 'neutral', 'sm'),
        h(
          'div',
          { class: 'phone__row-text' },
          h('strong', {}, m.name),
          h('span', {}, last ? (last.from === 'me' ? `나: ${last.text}` : last.text) : '아직 연락이 없어요. 호감도를 올려 보세요'),
        ),
        h('div', { class: 'phone__row-meta' }, last ? h('small', {}, time(last.at)) : null, t?.unread ? h('span', { class: 'badge' }, String(t.unread)) : null),
      );
      onTap(row, () => {
        current = m.id;
        render();
      });
      return row;
    });
    screen.replaceChildren(h('div', { class: 'phone__head' }, h('strong', {}, '메시지')), h('div', { class: 'phone__list' }, ...rows));
  }

  function renderThread(id: string) {
    const m = getMember(id)!;
    const t = game.state.phone.threads[id];
    game.markRead(id);
    const back = h('button', { class: 'phone__back', type: 'button', 'aria-label': '목록' }, '‹');
    onTap(back, () => {
      current = null;
      render();
    });
    const log = h('div', { class: 'phone__log' });
    const msgs = t.log;
    msgs.forEach((msg, i) => {
      const fresh = replied > 0 && i >= msgs.length - replied;
      const bubble = h('div', { class: `msg msg--${msg.from}${fresh ? ' is-fresh' : ''}` }, msg.from === 'them' ? memberFace(m, 'neutral', 'sm') : null, h('p', {}, msg.text));
      if (fresh) bubble.style.setProperty('--delay', `${(i - (msgs.length - replied)) * 550}ms`);
      log.append(bubble);
    });
    const convo = pendingConvo(game.state, id);
    const choices = h('div', { class: 'phone__choices' });
    if (convo) {
      convo.choices.forEach((c, i) => {
        const b = h('button', { class: 'phone__choice', type: 'button' }, c.t);
        onTap(b, () => {
          const before = t.log.length;
          const xp = game.reply(id, i);
          if (xp === null) return;
          replied = game.state.phone.threads[id].log.length - before;
          sfx.chime();
          render();
          popNumber(screen, `💗 +${xp}`, 'fx-pop--bond');
          replied = 0;
        });
        choices.append(b);
      });
    } else {
      const n = NARRATIVE.texts[id].length;
      choices.append(h('p', { class: 'phone__wait' }, t.next >= n ? '모든 대화를 나눴어요 💌' : '다음 문자를 기다리는 중… (접속하거나 마일스톤·호감도가 오르면 와요)'));
    }
    screen.replaceChildren(h('div', { class: 'phone__head' }, back, memberFace(m, 'neutral', 'sm'), h('strong', {}, m.name)), log, choices);
    requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
  }

  function render() {
    if (current) renderThread(current);
    else renderList();
  }

  const off = game.on((e) => {
    if (!document.body.contains(root)) return off();
    if (e.type === 'phone') render();
  });
  render();
}
