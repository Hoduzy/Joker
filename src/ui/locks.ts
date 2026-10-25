import type { Game } from '../core/game';
import { FEATURE_LABELS, type Feature } from '../core/unlocks';
import { BALANCE } from '../data/balance';
import { formatNumber } from '../utils/format';
import type { Component } from './component';
import { h } from './dom';
import { toast } from './toast';

/** 잠긴 기능을 눌렀을 때 안내 */
export function lockNotice(feature: Feature): void {
  toast(`🔒 ${FEATURE_LABELS[feature]} — 누적 청취자 ${formatNumber(BALANCE.unlocks[feature])}명에 열려요`);
}

/** 잠긴 동안 보여 줄 안내 카드 (진행 막대 포함) */
export function lockCard(game: Game, at: number, icon: string, title: string, desc: string) {
  const fill = h('div', { class: 'progress__fill' });
  const count = h('span', { class: 'lock-card__count' });
  const el = h(
    'div',
    { class: 'panel lock-card' },
    h('div', { class: 'lock-card__icon', 'aria-hidden': 'true' }, icon, h('span', { class: 'lock-card__lock' }, '🔒')),
    h('h2', { class: 'lock-card__title' }, title),
    h('p', { class: 'lock-card__desc' }, desc),
    h('div', { class: 'progress lock-card__bar' }, fill),
    count,
  );
  return {
    el,
    tick() {
      const t = game.state.totalListeners;
      fill.style.width = `${Math.min(100, (t / at) * 100)}%`;
      const text = `누적 청취자 ${formatNumber(t)} / ${formatNumber(at)}`;
      if (count.textContent !== text) count.textContent = text;
    },
  };
}

/**
 * 기능이 열리기 전에는 안내 카드를, 열리면 원래 화면을 보여 준다.
 * 열리기 전에는 안쪽 컴포넌트를 그리지 않는다
 */
export function createLockGate(game: Game, feature: Feature, inner: Component, icon: string, desc: string): Component {
  const card = lockCard(game, BALANCE.unlocks[feature], icon, `${FEATURE_LABELS[feature]}`, desc);
  const el = h('div', { class: 'lock-gate' }, card.el, inner.el);
  // 방송실의 택배 패널처럼 격자 칸 이름을 쓰는 경우를 위해 안쪽 클래스를 따라간다
  const sync = () => {
    const open = game.isUnlocked(feature);
    card.el.hidden = open;
    inner.el.hidden = !open;
    return open;
  };
  return {
    el,
    render() {
      if (sync()) inner.render();
    },
    tick() {
      if (sync()) inner.tick?.();
      else card.tick();
    },
  };
}
