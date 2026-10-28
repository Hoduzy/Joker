import { popNumber } from './fx';
import { sfx } from './sfx';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { FLAVOR, pick } from '../data/flavor';
import type { Chat } from './chat';
import { h } from './dom';
import type { Studio } from './studio';
import { startTuning } from './tuning';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** 다른 팝업·뽑기 연출·이벤트가 떠 있거나 화면을 안 보고 있으면 이벤트를 미룬다 */
function blocked(): boolean {
  return (
    document.visibilityState !== 'visible' ||
    !!document.querySelector('#modal, #sheet, .pull, .flyer, .tuner, .story, .battle, .vn, .phone, .admin, .title-screen')
  );
}

function assignedMembers(game: Game): string[] {
  return Object.values(game.state.assignments)
    .map((id) => (id ? getCard(id)?.member : undefined))
    .filter((m): m is string => !!m);
}

/**
 * 방송 중 돌발 이벤트들을 돌린다.
 * - 말풍선: 배치된 부원이 각자 10~20초마다 한마디
 * - 레전드 사연: 1~3분마다 엽서가 화면을 가로지른다. 탭하면 30초간 청취자 ×3
 * - 방송사고: 전파 이탈. 다이얼로 주파수를 다시 잡는다 (ui/tuning.ts)
 */
export function startLiveEvents(game: Game, studio: Studio, chat: Chat): { syncBubbles(): void } {
  // ── 말풍선
  const bubbleTimers = new Map<string, number>();
  function scheduleBubble(memberId: string) {
    const t = window.setTimeout(() => {
      if (!assignedMembers(game).includes(memberId)) {
        bubbleTimers.delete(memberId);
        return;
      }
      if (document.visibilityState === 'visible') {
        const line = pick(FLAVOR.barks[memberId] ?? []);
        if (line && studio.say(memberId, line, BALANCE.bubbles.showMs) && Math.random() < 0.35) {
          // 청취자가 가끔 말풍선에 반응한다
          setTimeout(() => chat.react(memberId), 900);
        }
      }
      scheduleBubble(memberId);
    }, rand(BALANCE.bubbles.minIntervalMs, BALANCE.bubbles.maxIntervalMs));
    bubbleTimers.set(memberId, t);
  }
  function syncBubbles() {
    const members = assignedMembers(game);
    for (const [id, t] of bubbleTimers) {
      if (!members.includes(id)) {
        window.clearTimeout(t);
        bubbleTimers.delete(id);
      }
    }
    // 처음 배치되면 3~8초 뒤 첫 마디 (그다음부터 10~20초 간격)
    for (const id of members) {
      if (bubbleTimers.has(id)) continue;
      const t = window.setTimeout(() => {
        bubbleTimers.delete(id);
        const line = pick(FLAVOR.barks[id] ?? []);
        if (line && document.visibilityState === 'visible') studio.say(id, line, BALANCE.bubbles.showMs);
        scheduleBubble(id);
      }, rand(3000, 8000));
      bubbleTimers.set(id, t);
    }
  }

  // ── 스케줄러
  function schedule(kind: 'legend' | 'accident', first = false) {
    let delay: number;
    if (kind === 'legend') {
      delay = first ? rand(20_000, 40_000) : rand(BALANCE.legend.minIntervalMs, BALANCE.legend.maxIntervalMs) / game.legendFrequency();
    } else {
      delay = first ? rand(90_000, 150_000) : rand(BALANCE.accident.minIntervalMs, BALANCE.accident.maxIntervalMs);
    }
    window.setTimeout(() => trySpawn(kind), delay);
  }
  function trySpawn(kind: 'legend' | 'accident') {
    // 방송 중이 아니면(아무도 배치 안 됨) 이벤트도 없다
    if (blocked() || game.baseRate <= 0 || !game.isUnlocked(kind)) {
      window.setTimeout(() => trySpawn(kind), 4000);
      return;
    }
    if (kind === 'legend') spawnPostcard(() => schedule('legend'));
    else startTuning(game, studio, chat, () => schedule('accident'));
  }

  // ── 레전드 사연 엽서
  function spawnPostcard(done: () => void) {
    const story = pick(FLAVOR.stories)!;
    const flyer = h(
      'button',
      { class: 'flyer', type: 'button', 'aria-label': '레전드 사연 엽서 잡기' },
      h('div', { class: 'flyer__card' }, h('span', { class: 'flyer__stamp' }, '📮'), h('span', { class: 'flyer__text' }, 'LEGEND'), h('span', { class: 'flyer__tap' }, 'TAP!')),
    );
    flyer.style.top = `${rand(22, 62)}vh`;
    flyer.style.setProperty('--flight', `${BALANCE.legend.flightMs}ms`);
    // 오른쪽에서 왼쪽으로 날아갈 때도 있다
    if (Math.random() < 0.5) flyer.classList.add('is-reverse');
    let caught = false;
    const finish = () => {
      flyer.remove();
      done();
    };
    flyer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (caught) return;
      caught = true;
      game.claimLegend();
      sfx.grade(3);
      popNumber({ x: e.clientX, y: e.clientY }, '×3!');
      flyer.classList.add('is-caught');
      chat.burst('legend', 4);
      showStory(story.from, story.text);
      setTimeout(finish, 350);
    });
    flyer.addEventListener('animationend', (e) => {
      if (e.target !== flyer || caught) return;
      chat.burst('legendMissed', 1);
      finish();
    });
    document.body.append(flyer);
  }

  function showStory(from: string, text: string) {
    const card = h(
      'div',
      { class: 'story', role: 'status' },
      h('div', { class: 'story__head' }, h('span', {}, '📮 레전드 사연'), h('span', { class: 'story__boost' }, `청취자 ×${BALANCE.legend.multiplier} · ${BALANCE.legend.durationMs / 1000}초`)),
      h('p', { class: 'story__text' }, text),
      h('div', { class: 'story__from' }, `— ${from}`),
    );
    const close = () => {
      card.classList.add('is-out');
      setTimeout(() => card.remove(), 250);
    };
    card.addEventListener('click', close);
    document.body.append(card);
    setTimeout(close, 6000);
  }

  // 관리자 패널 '방송사고 지금 발생'
  document.addEventListener('simya:accident', () => {
    if (game.baseRate > 0 && !document.querySelector('.tuner')) startTuning(game, studio, chat, () => {});
  });

  syncBubbles();
  schedule('legend', true);
  schedule('accident', true);
  return { syncBubbles };
}
