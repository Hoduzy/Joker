import { towerMultiplier } from '../core/economy';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { formatNumber } from '../utils/format';
import type { Component } from './component';
import { h, onTap } from './dom';

/** 송신탑 레벨업 패널 */
export function createTower(game: Game): Component {
  const level = h('span', { class: 'tower__level' });
  const mult = h('span', { class: 'tower__mult' });
  const bar = h('div', { class: 'progress__fill' });
  const cost = h('span', { class: 'btn__sub' });
  const button = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, h('span', {}, '송신탑 레벨업'), cost);
  onTap(button, () => game.upgradeTower());

  const el = h(
    'section',
    { class: 'panel tower' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '송신탑'), level),
    h('div', { class: 'tower__body' }, h('div', { class: 'tower__icon', 'aria-hidden': 'true' }, h('div', { class: 'tower__mast' })), h('div', { class: 'tower__info' }, mult, h('div', { class: 'progress' }, bar))),
    button,
  );

  return {
    el,
    render() {
      const lv = game.state.towerLevel;
      level.textContent = `Lv.${lv}`;
      const now = towerMultiplier(lv);
      const next = towerMultiplier(lv + 1);
      mult.textContent = `송출 배율 ×${now.toFixed(2)} → ×${next.toFixed(2)} (+${Math.round((BALANCE.tower.outputGrowth - 1) * 100)}%)`;
      cost.textContent = `${formatNumber(game.towerCost)} 청취자`;
    },
    tick() {
      const ratio = Math.min(1, game.state.listeners / game.towerCost);
      bar.style.width = `${ratio * 100}%`;
      const can = game.canUpgradeTower();
      if (button.disabled === can) button.disabled = !can;
    },
  };
}
