import type { Game } from '../core/game';
import { formatNumber, formatRate } from '../utils/format';
import type { Component } from './component';
import { h } from './dom';

export function createHeader(game: Game): Component {
  const count = h('span', { class: 'hud__count' }, '0');
  const rate = h('span', { class: 'hud__rate' }, '');
  const lamp = h('span', { class: 'onair' }, 'ON AIR');

  const el = h(
    'header',
    { class: 'hud' },
    h('div', { class: 'hud__brand' }, lamp, h('h1', { class: 'hud__title' }, '심야방송부')),
    h('div', { class: 'hud__stat' }, h('span', { class: 'hud__label' }, '청취자'), count, rate),
  );

  return {
    el,
    render() {
      lamp.classList.toggle('is-live', game.rate > 0);
    },
    tick() {
      count.textContent = formatNumber(game.state.listeners);
      rate.textContent = `+${formatRate(game.rate)} /초`;
    },
  };
}
