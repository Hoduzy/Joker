import { isFullLineup, limitBreakOf, slotPower } from '../core/economy';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { getMember } from '../data/members';
import { SLOTS, type SlotDef } from '../data/slots';
import { STAT_LABELS } from '../data/stats';
import { openCardPicker } from './assign';
import { lbPips, rarityBadge } from './cardView';
import type { Component } from './component';
import { h, memberSd, onTap } from './dom';

/** 방송 슬롯 4개(DJ/엔지니어/작가/게스트). 카드 단위로 배치한다. */
export function createStudio(game: Game, onPoke: (memberId: string) => void): Component {
  const grid = h('div', { class: 'slots' });
  const bonus = h('p', { class: 'studio__bonus' });
  const el = h(
    'section',
    { class: 'panel studio' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '오늘의 방송'), bonus),
    grid,
  );

  function renderSlot(slot: SlotDef): HTMLElement {
    const cardId = game.state.assignments[slot.id];
    const card = cardId ? getCard(cardId) : undefined;
    const member = card ? getMember(card.member) : undefined;
    const role = h('div', { class: 'slot__role' }, slot.name, h('span', { class: 'slot__stat' }, STAT_LABELS[slot.mainStat]));

    if (!card || !member) {
      const empty = h(
        'button',
        { class: 'slot slot--empty', type: 'button' },
        role,
        h('div', { class: 'slot__stage' }, h('div', { class: 'slot__plus' }, '+')),
        h('div', { class: 'slot__name' }, '비어 있음'),
        h('div', { class: 'slot__power' }, '탭해서 카드 배치'),
      );
      onTap(empty, () => openCardPicker(game, slot));
      return empty;
    }

    const lb = limitBreakOf(game.state, card.id);
    const matched = card.slot === slot.id;
    // SD를 탭하면 대사, 아래 버튼으로 교체
    const stage = h('button', { class: 'slot__stage', type: 'button', 'aria-label': `${member.name}에게 말 걸기` }, memberSd(member));
    onTap(stage, () => {
      stage.classList.remove('is-bounce');
      void stage.offsetWidth;
      stage.classList.add('is-bounce');
      onPoke(member.id);
    });
    const change = h('button', { class: 'slot__change', type: 'button' }, '교체');
    onTap(change, () => openCardPicker(game, slot));
    const el = h(
      'div',
      { class: `slot slot--${card.rarity}` },
      role,
      stage,
      h('div', { class: 'slot__name' }, member.name, rarityBadge(card.rarity)),
      h('div', { class: 'slot__card' }, card.title),
      h(
        'div',
        { class: 'slot__power' },
        `파워 ${Math.round(slotPower(card, lb, slot))}`,
        matched ? h('span', { class: 'tag tag--slot is-active' }, '담당 +30%') : null,
      ),
      lb > 0 ? lbPips(lb) : null,
      change,
    );
    el.style.setProperty('--member-color', member.color);
    return el;
  }

  return {
    el,
    render() {
      grid.replaceChildren(...SLOTS.map(renderSlot));
      const full = isFullLineup(game.state);
      const pct = Math.round((BALANCE.fullLineupBonus - 1) * 100);
      bonus.textContent = full ? `풀 라인업 보너스 +${pct}%` : `4명 모두 배치 시 +${pct}%`;
      bonus.classList.toggle('is-active', full);
    },
  };
}
