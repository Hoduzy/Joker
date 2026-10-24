import { cardStats, limitBreakOf, slotPower } from '../core/economy';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { CARDS, type CardDef } from '../data/cards';
import { MEMBERS, getMember } from '../data/members';
import { SLOTS } from '../data/slots';
import { STAT_KEYS, STAT_LABELS } from '../data/stats';
import { openSlotPicker } from './assign';
import { cardFrame, lbPips, rarityBadge, slotName } from './cardView';
import type { Component } from './component';
import { h, onTap } from './dom';
import { openModal } from './modal';

const RARITY_ORDER = { R: 0, SR: 1, SSR: 2 } as const;

/** 도감: 모든 카드를 부원별로 보여 준다. 안 뽑은 카드는 실루엣. */
export function createCollection(game: Game): Component {
  const progress = h('span', { class: 'panel__sub' });
  const bar = h('div', { class: 'progress__fill' });
  const body = h('div', { class: 'collection' });
  const el = h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '부원 카드 도감'), progress),
    h('div', { class: 'progress collection__progress' }, bar),
    body,
  );

  return {
    el,
    render() {
      const owned = game.state.cards;
      const ownedCount = CARDS.filter((c) => owned[c.id]).length;
      progress.textContent = `${ownedCount} / ${CARDS.length} (${Math.round((ownedCount / CARDS.length) * 100)}%)`;
      bar.style.width = `${(ownedCount / CARDS.length) * 100}%`;

      body.replaceChildren(
        ...MEMBERS.map((member) => {
          const cards = CARDS.filter((c) => c.member === member.id).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
          if (cards.length === 0) return h('div');
          const have = cards.filter((c) => owned[c.id]).length;
          return h(
            'div',
            { class: 'collection__group' },
            h('h3', { class: 'collection__member' }, member.name, h('span', {}, `${have}/${cards.length}`)),
            h(
              'div',
              { class: 'collection__grid' },
              ...cards.map((card) => {
                const isOwned = !!owned[card.id];
                const btn = h('button', { class: 'collection__item', type: 'button' }, cardFrame(card, { size: 'md', owned: isOwned, limitBreak: isOwned ? limitBreakOf(game.state, card.id) : undefined }));
                onTap(btn, () => openCardDetail(game, card));
                return btn;
              }),
            ),
          );
        }),
      );
    },
  };
}

/** 카드 상세 */
export function openCardDetail(game: Game, card: CardDef): void {
  const member = getMember(card.member)!;
  const owned = game.state.cards[card.id];
  if (!owned) {
    openModal({
      title: '아직 만나지 못한 카드',
      body: h('div', { class: 'detail detail--locked' }, cardFrame(card, { size: 'lg', owned: false }), h('p', {}, `${card.rarity} 등급 · ${member.name}의 카드`), h('p', { class: 'detail__hint' }, '뽑기에서 만날 수 있어요.')),
      confirmLabel: '닫기',
    });
    return;
  }
  const lb = owned.limitBreak;
  const stats = cardStats(card, lb);
  const nextStats = lb < BALANCE.limitBreak.max ? cardStats(card, lb + 1) : null;
  const info = h(
    'div',
    { class: 'detail__info' },
    h('div', { class: 'detail__top' }, rarityBadge(card.rarity), h('strong', {}, member.name)),
    h('h3', { class: 'detail__title' }, card.title),
    card.quote ? h('p', { class: 'detail__quote' }, `“${card.quote}”`) : null,
    h('div', { class: 'detail__row' }, h('span', {}, '돌파'), lbPips(lb), h('span', { class: 'detail__muted' }, `${lb}/${BALANCE.limitBreak.max} · 능력치 +${Math.round(lb * BALANCE.limitBreak.statBonusPerLevel * 100)}%`)),
    h('div', { class: 'detail__row' }, h('span', {}, '담당'), h('span', { class: 'tag tag--slot is-active' }, `${slotName(card.slot)} +${Math.round(BALANCE.slotBonus * 100)}%`)),
    h(
      'div',
      { class: 'detail__stats' },
      ...STAT_KEYS.map((key) =>
        h('div', { class: 'detail__stat' }, h('span', {}, STAT_LABELS[key]), h('strong', {}, String(stats[key])), nextStats ? h('span', { class: 'detail__next' }, `다음 돌파 ${nextStats[key]}`) : null),
      ),
    ),
    h(
      'div',
      { class: 'detail__powers' },
      ...SLOTS.map((slot) => h('div', { class: `detail__power${slot.id === card.slot ? ' is-best' : ''}` }, h('span', {}, slot.name), h('strong', {}, String(Math.round(slotPower(card, lb, slot)))))),
    ),
  );
  openModal({
    title: '카드 정보',
    body: h('div', { class: 'detail' }, cardFrame(card, { size: 'lg', limitBreak: lb }), info),
    cancelLabel: '닫기',
    confirmLabel: '방송에 배치',
    onConfirm: () => openSlotPicker(game, card),
    wide: true,
  });
}
