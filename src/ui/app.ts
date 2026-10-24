import { getCard } from '../data/cards';
import type { Game } from '../core/game';
import type { PullResult } from '../core/gacha';
import type { OfflineResult } from '../core/offline';
import { BALANCE } from '../data/balance';
import { formatDuration, formatNumber } from '../utils/format';
import { createCardList } from './cardList';
import { createCollection } from './collection';
import type { Component } from './component';
import { createDelivery } from './delivery';
import { createDialogue } from './dialogue';
import { openCompare } from './equipCompare';
import { h, onTap } from './dom';
import { createGacha } from './gacha';
import { createHeader } from './header';
import { openModal } from './modal';
import { closeSheet } from './sheet';
import { createStudio } from './studio';
import { createTabs, ICONS } from './tabs';
import { gemIcon, toast } from './toast';
import { createTower } from './tower';

type ScreenId = 'studio' | 'gacha' | 'collection';
const TAB_KEY = 'simya-bangsongbu/tab';
const RARITY_RANK = { R: 0, SR: 1, SSR: 2 } as const;

/** 화면 전체를 조립하고 게임 이벤트와 연결한다. */
export function mountApp(root: HTMLElement, game: Game): void {
  const dialogue = createDialogue();
  const header = createHeader(game);
  const studio = createStudio(game, (id) => dialogue.say(id, 'poke'));
  const tower = createTower(game);
  const cardList = createCardList(game);
  const gacha = createGacha(game, (results) => sayAboutNewCard(results));
  const collection = createCollection(game);
  const delivery = createDelivery(game);
  const components: Component[] = [header, delivery, studio, tower, cardList, gacha, collection];

  const resetBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '데이터 초기화');
  onTap(resetBtn, () =>
    openModal({
      title: '처음부터 다시 할까요?',
      body: h('p', {}, '저장된 진행 상황과 카드가 모두 삭제됩니다.'),
      cancelLabel: '취소',
      confirmLabel: '초기화',
      onConfirm: () => game.reset(),
    }),
  );

  const screens: Record<ScreenId, HTMLElement> = {
    studio: h(
      'main',
      { class: 'screen', 'data-screen': 'studio' },
      delivery.el,
      h(
        'div',
        { class: 'layout' },
        h('div', { class: 'layout__main' }, studio.el, tower.el),
        h(
          'div',
          { class: 'layout__side' },
          cardList.el,
          h('footer', { class: 'footer' }, h('a', { class: 'btn btn--ghost btn--small', href: './preview.html' }, '캐릭터 이미지 미리보기'), resetBtn),
        ),
      ),
    ),
    gacha: h('main', { class: 'screen', 'data-screen': 'gacha' }, gacha.el),
    collection: h('main', { class: 'screen', 'data-screen': 'collection' }, collection.el),
  };

  const tabs = createTabs(
    [
      { id: 'studio', label: '방송실', icon: ICONS.studio },
      { id: 'gacha', label: '뽑기', icon: ICONS.gacha },
      { id: 'collection', label: '도감', icon: ICONS.collection },
    ],
    (id) => show(id as ScreenId),
  );

  function show(id: ScreenId) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== id;
    tabs.select(id);
    closeSheet();
    window.scrollTo(0, 0);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // 무시
    }
  }

  root.replaceChildren(header.el, ...Object.values(screens), tabs.el, dialogue.el);

  const renderAll = () => {
    for (const c of components) c.render();
    for (const c of components) c.tick?.();
  };

  /** 이번 뽑기에서 새로 얻은 카드 중 가장 높은 등급의 부원이 한마디 */
  function sayAboutNewCard(results: PullResult[]) {
    const best = results.filter((r) => r.isNew).sort((a, b) => RARITY_RANK[b.card.rarity] - RARITY_RANK[a.card.rarity])[0];
    if (best) dialogue.say(best.card.member, 'newCard');
  }

  game.on((event) => {
    switch (event.type) {
      case 'changed':
        renderAll();
        break;
      case 'offline-reward':
        showOfflineReward(event.result, () => {
          const id = randomAssignedMember(game);
          if (id) dialogue.say(id, 'welcomeBack');
        });
        break;
      case 'assigned': {
        const now = event.cardId ? getCard(event.cardId) : undefined;
        const prev = event.previous ? getCard(event.previous) : undefined;
        if (now) dialogue.say(now.member, 'assigned');
        else if (prev) dialogue.say(prev.member, 'unassigned');
        break;
      }
      case 'tower-up': {
        toast(`송신탑 Lv.${event.level}! 전파석 +${event.reward}`, gemIcon());
        const id = randomAssignedMember(game);
        if (id) dialogue.say(id, 'towerUp');
        break;
      }
      case 'stones':
        toast(`${event.reason}! 전파석 +${formatNumber(event.amount)}`, gemIcon());
        break;
      case 'legend-story':
        toast(`📮 레전드 사연 도착! 청취자 +${formatNumber(event.amount)}`);
        break;
      case 'box-level':
        toast(
          event.level === BALANCE.box.autoUnlockLevel
            ? `📦 택배 Lv.${event.level}! 자동 개봉이 열렸어요`
            : `📦 택배 Lv.${event.level}! 좋은 장비가 더 잘 나와요`,
        );
        break;
    }
  });

  let saved: ScreenId = 'studio';
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t === 'gacha' || t === 'collection') saved = t;
  } catch {
    // 무시
  }
  renderAll();
  show(saved);
  // 고르지 않고 닫았던 장비가 있으면 다시 보여 준다
  if (game.state.box.pending && saved === 'studio') openCompare(game, game.state.box.pending);
  startLoop(game, components, tabs);
  bindLifecycle(game);
}

function randomAssignedMember(game: Game): string | undefined {
  const ids = Object.values(game.state.assignments)
    .filter((id): id is string => id !== null)
    .map((id) => getCard(id)?.member)
    .filter((m): m is string => !!m);
  return ids[Math.floor(Math.random() * ids.length)];
}

function showOfflineReward(result: OfflineResult, onClose: () => void): void {
  closeSheet();
  const capped = result.rawElapsedMs > result.elapsedMs;
  openModal({
    title: '방송은 계속되고 있었어요',
    body: h(
      'div',
      { class: 'offline' },
      h('p', {}, `자리를 비운 ${formatDuration(result.rawElapsedMs)} 동안`),
      h('p', { class: 'offline__amount' }, `+${formatNumber(result.earned)}`),
      h('p', {}, '명의 청취자가 모였습니다.'),
      capped ? h('p', { class: 'offline__note' }, `오프라인 보상은 최대 ${formatDuration(BALANCE.offlineCapMs)}까지 쌓여요.`) : null,
    ),
    confirmLabel: '좋아!',
    onConfirm: onClose,
  });
}

function startLoop(game: Game, components: Component[], tabs: ReturnType<typeof createTabs>): void {
  const frame = () => {
    game.advance();
    for (const c of components) c.tick?.();
    tabs.setDot('gacha', game.canPull(1));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function bindLifecycle(game: Game): void {
  // 홈 화면으로 나가거나 탭을 전환할 때 즉시 저장해서, 다음 실행 시 정확한 오프라인 시간을 계산한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      game.advance();
      game.save();
    }
  });
  window.addEventListener('pagehide', () => game.save());
}
