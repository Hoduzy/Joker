import { cardStats, limitBreakOf } from '../core/economy';
import type { Game } from '../core/game';
import { CARDS, compareCards, getCard, type CardDef } from '../data/cards';
import { getMember } from '../data/members';
import { SLOTS } from '../data/slots';
import { STAT_KEYS, STAT_LABELS } from '../data/stats';
import { openSlotPicker } from './assign';
import { cardFrame, lbPips, rarityBadge, slotTag } from './cardView';
import type { Component } from './component';
import { h, onTap } from './dom';

/** 방송실 화면 오른쪽: 보유 카드 목록. 카드를 탭하면 배치할 슬롯을 고른다. */
export function createCardList(game: Game): Component {
  const list = h('div', { class: 'roster' });
  const count = h('span', { class: 'panel__sub' });
  const el = h('section', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '보유 카드'), count), list);

  function renderCard(card: CardDef): HTMLElement {
    const member = getMember(card.member)!;
    const lb = limitBreakOf(game.state, card.id);
    const slot = SLOTS.find((s) => game.state.assignments[s.id] === card.id);
    const stats = cardStats(card, lb);
    const row = h(
      'button',
      { class: `member${slot ? ' is-assigned' : ''}`, type: 'button' },
      cardFrame(card, { size: 'sm' }),
      h(
        'div',
        { class: 'member__body' },
        h(
          'div',
          { class: 'member__top' },
          h('span', { class: 'member__name' }, member.name),
          rarityBadge(card.rarity),
          lbPips(lb),
          slot ? h('span', { class: 'tag tag--on' }, `${slot.name} 배치 중`) : null,
        ),
        h('div', { class: 'member__tagline' }, card.title, ' ', slotTag(card.slot, slot?.id === card.slot)),
        h(
          'div',
          { class: 'stats' },
          ...STAT_KEYS.map((key) => {
            const fill = h('div', { class: 'stat__fill' });
            fill.style.width = `${Math.min(100, (stats[key] / 80) * 100)}%`;
            return h('div', { class: 'stat' }, h('span', { class: 'stat__label' }, STAT_LABELS[key]), h('div', { class: 'stat__bar' }, fill), h('span', { class: 'stat__value' }, String(stats[key])));
          }),
        ),
      ),
    );
    onTap(row, () => openSlotPicker(game, card));
    return row;
  }

  return {
    el,
    render() {
      const owned = Object.keys(game.state.cards)
        .map(getCard)
        .filter((c): c is CardDef => !!c)
        .sort(compareCards);
      count.textContent = `${owned.length} / ${CARDS.length}장`;
      list.replaceChildren(...owned.map(renderCard));
    },
  };
}
