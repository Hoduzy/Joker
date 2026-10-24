import { getMember } from '../data/members';
import { pickLine, type LineEvent } from '../data/lines';
import { faceUrl } from '../data/portraits';
import { h, memberFace } from './dom';

const SHOW_MS = 4500;

/**
 * 화면 아래에 뜨는 대화창. 게임 조작을 막지 않고, 탭하거나 시간이 지나면 사라진다.
 * 새 대사가 오면 이전 대사를 바로 덮어쓴다.
 */
export function createDialogue() {
  const frame = h('div', { class: 'dialogue__face' });
  const name = h('div', { class: 'dialogue__name' });
  const text = h('p', { class: 'dialogue__text' });
  const el = h(
    'div',
    { class: 'dialogue', role: 'status', 'aria-live': 'polite' },
    frame,
    h('div', { class: 'dialogue__body' }, name, text),
  );
  let timer = 0;

  const hide = () => {
    el.classList.remove('is-open');
    window.clearTimeout(timer);
  };
  el.addEventListener('click', hide);

  function say(memberId: string, event: LineEvent) {
    const member = getMember(memberId);
    const line = pickLine(memberId, event);
    if (!member || !line) return;
    // 표정 이미지는 미리 받아 두고 바꿔서 깜빡임을 줄인다.
    const url = faceUrl(memberId, line.expr);
    if (url) new Image().src = url;
    frame.replaceChildren(memberFace(member, line.expr));
    frame.style.setProperty('--member-color', member.color);
    name.textContent = member.name;
    text.textContent = line.text;
    el.classList.remove('is-open');
    void el.offsetWidth; // 애니메이션 재시작
    el.classList.add('is-open');
    window.clearTimeout(timer);
    timer = window.setTimeout(hide, SHOW_MS);
  }

  return { el, say, hide };
}

export type Dialogue = ReturnType<typeof createDialogue>;
