import type { Game } from '../core/game';
import type { OfflineResult } from '../core/offline';
import { BALANCE } from '../data/balance';
import { formatDuration, formatNumber } from '../utils/format';
import type { Component } from './component';
import { h, onTap } from './dom';
import { createHeader } from './header';
import { openModal } from './modal';
import { createRoster } from './roster';
import { closeSheet } from './sheet';
import { createStudio } from './studio';
import { createTower } from './tower';

/** 화면 전체를 조립하고 게임 이벤트와 연결한다. */
export function mountApp(root: HTMLElement, game: Game): void {
  const header = createHeader(game);
  const studio = createStudio(game);
  const tower = createTower(game);
  const roster = createRoster(game);
  const components: Component[] = [header, studio, tower, roster];

  const resetBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '데이터 초기화');
  onTap(resetBtn, () =>
    openModal({
      title: '처음부터 다시 할까요?',
      body: h('p', {}, '저장된 진행 상황이 모두 삭제됩니다.'),
      cancelLabel: '취소',
      confirmLabel: '초기화',
      onConfirm: () => game.reset(),
    }),
  );

  root.replaceChildren(
    header.el,
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'layout__main' }, studio.el, tower.el),
      h('div', { class: 'layout__side' }, roster.el, h('footer', { class: 'footer' }, resetBtn)),
    ),
  );

  const renderAll = () => {
    for (const c of components) c.render();
    for (const c of components) c.tick?.();
  };

  game.on((event) => {
    if (event.type === 'changed') renderAll();
    if (event.type === 'offline-reward') showOfflineReward(event.result);
  });

  renderAll();
  startLoop(game, components);
  bindLifecycle(game);
}

function showOfflineReward(result: OfflineResult): void {
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
  });
}

function startLoop(game: Game, components: Component[]): void {
  const frame = () => {
    game.advance();
    for (const c of components) c.tick?.();
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
