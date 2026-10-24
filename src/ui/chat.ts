import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { FLAVOR, getCorner, pick, type ChatEvent } from '../data/flavor';
import { formatNumber } from '../utils/format';
import { slotName } from './cardView';
import type { Component } from './component';
import { h } from './dom';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** 닉네임마다 고정된 색 */
function nickColor(nick: string): string {
  let hash = 0;
  for (const ch of nick) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 75% 72%)`;
}

export interface Chat extends Component {
  /** 이벤트 반응 채팅을 몇 개 연달아 띄운다 */
  burst(event: ChatEvent, count?: number): void;
  /** 특정 부원에 대한 반응 한 줄 */
  react(memberId: string): void;
}

/** 실시간 청취자 채팅 */
export function createChat(game: Game): Chat {
  const list = h('ul', { class: 'chat__list', 'aria-live': 'off' });
  const viewers = h('span', { class: 'chat__viewers' });
  const corner = h('div', { class: 'chat__corner' });
  const el = h(
    'aside',
    { class: 'panel chat', 'aria-label': '실시간 채팅' },
    h('div', { class: 'chat__head' }, h('span', { class: 'chat__live' }, 'LIVE'), h('strong', {}, '실시간 채팅'), viewers),
    corner,
    list,
  );

  function push(text: string, nick = pick(FLAVOR.nicknames) ?? '익명', special = false) {
    const li = h('li', { class: `chat__msg${special ? ' is-special' : ''}` }, h('span', { class: 'chat__nick' }, nick), h('span', { class: 'chat__text' }, text));
    (li.firstChild as HTMLElement).style.color = nickColor(nick);
    list.append(li);
    while (list.children.length > BALANCE.chat.maxMessages) list.firstElementChild?.remove();
    list.scrollTop = list.scrollHeight;
  }

  function assignedMembers(): string[] {
    return Object.values(game.state.assignments)
      .map((id) => (id ? getCard(id)?.member : undefined))
      .filter((m): m is string => !!m);
  }

  /** 상황에 맞는 채팅 한 줄 고르기: 배치된 부원 35% · 오늘의 코너 30% · 일반 35% */
  function randomLine(): string | undefined {
    const r = Math.random();
    const members = assignedMembers();
    if (r < 0.35 && members.length) {
      const line = pick(FLAVOR.members[pick(members)!] ?? []);
      if (line) return line;
    }
    if (r < 0.65) {
      const line = pick(getCorner(game.state.corner.id)?.chat ?? []);
      if (line) return line;
    }
    return pick(FLAVOR.general);
  }

  // 창 크기가 바뀌어도 항상 최신 채팅이 보이게
  new ResizeObserver(() => (list.scrollTop = list.scrollHeight)).observe(list);

  let timer = 0;
  function loop() {
    // 화면을 보고 있을 때만 흐른다. 아무도 방송에 없으면 조용하다
    if (document.visibilityState === 'visible' && assignedMembers().length > 0) {
      const line = randomLine();
      if (line) push(line);
    }
    // 레전드 사연 중에는 채팅이 빨라진다
    const speed = game.multiplier() > 1 ? 0.4 : 1;
    timer = window.setTimeout(loop, rand(BALANCE.chat.minIntervalMs, BALANCE.chat.maxIntervalMs) * speed);
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(loop, 800);

  return {
    el,
    render() {
      const c = getCorner(game.state.corner.id);
      corner.replaceChildren(
        ...(c
          ? [
              h('span', { class: 'chat__corner-emoji' }, c.emoji),
              h('div', {}, h('div', { class: 'chat__corner-name' }, `오늘의 코너 · ${c.name}`), h('div', { class: 'chat__corner-desc' }, `${c.description} · ${slotName(c.slot)} 파워 +${Math.round(BALANCE.cornerBonus * 100)}%`)),
            ]
          : []),
      );
      if (list.children.length === 0) push('방송이 시작됐어요. 채팅 창이 열렸습니다.', '📻 안내', true);
    },
    tick() {
      // 청취자 수를 '시청자'처럼 보여 준다
      const v = formatNumber(Math.max(1, Math.round(game.rate * 3)));
      if (viewers.textContent !== v) viewers.textContent = `👀 ${v}`;
    },
    burst(event, count = 3) {
      const lines = FLAVOR.events[event];
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const line = pick(lines);
          if (line) push(line, undefined, i === 0);
        }, i * 260);
      }
    },
    react(memberId) {
      const line = pick(FLAVOR.members[memberId] ?? []);
      if (line) push(line);
    },
  };
}
