import { limitBreakOf, listenersPerSecond, previewRateWith, slotPower } from '../core/economy';
import { equipBonuses } from '../core/equipment';
import type { Game } from '../core/game';
import { compareCards, getCard, type CardDef } from '../data/cards';
import { getMember } from '../data/members';
import { SLOTS, type SlotDef } from '../data/slots';
import { STAT_LABELS } from '../data/stats';
import { formatRate } from '../utils/format';
import { cardFrame, lbPips, rarityBadge, slotTag } from './cardView';
import { h } from './dom';
import { openSheet, type SheetOption } from './sheet';

function diffBadge(next: number, current: number, label?: string): HTMLElement {
  const cls = next > current + 1e-9 ? 'is-up' : next < current - 1e-9 ? 'is-down' : '';
  const d = next - current;
  return h('span', { class: `pick__diff ${cls}` }, label ?? `${d >= 0 ? '+' : ''}${formatRate(d)}/초`);
}

/** 슬롯을 눌렀을 때: 어떤 카드를 넣을지 고른다 */
export function openCardPicker(game: Game, slot: SlotDef): void {
  const state = game.state;
  const current = state.assignments[slot.id];
  const baseRate = listenersPerSecond(state);
  const owned = Object.keys(state.cards)
    .map(getCard)
    .filter((c): c is CardDef => !!c)
    .map((card) => ({ card, rate: previewRateWith(state, slot.id, card.id) }))
    // 이 슬롯에서 생산량이 높은 순, 같으면 등급 순
    .sort((a, b) => b.rate - a.rate || compareCards(a.card, b.card));

  const options: SheetOption[] = owned.map(({ card, rate }) => {
    const member = getMember(card.member)!;
    const lb = limitBreakOf(state, card.id);
    // 같은 부원이 다른 슬롯에 나가 있으면 그 자리가 비워진다
    const sameMember = SLOTS.find((s) => s.id !== slot.id && state.assignments[s.id] && getCard(state.assignments[s.id]!)?.member === card.member);
    return {
      selected: current === card.id,
      onSelect: () => game.assign(slot.id, card.id),
      content: h(
        'div',
        { class: 'pick' },
        cardFrame(card, { size: 'xs' }),
        h(
          'div',
          { class: 'pick__info' },
          h('div', { class: 'pick__name' }, member.name, rarityBadge(card.rarity), lbPips(lb)),
          h('div', { class: 'pick__meta' }, card.title),
          h(
            'div',
            { class: 'pick__meta' },
            `${STAT_LABELS[slot.mainStat]} 파워 ${Math.round(slotPower(card, lb, slot, equipBonuses(state)))}`,
            card.slot === slot.id ? h('span', { class: 'tag tag--slot is-active' }, '담당 보너스 +30%') : slotTag(card.slot),
            sameMember ? h('span', { class: 'tag' }, `${sameMember.name}에서 이동`) : null,
          ),
        ),
        current === card.id ? diffBadge(0, 0, '배치 중') : diffBadge(rate, baseRate),
      ),
    };
  });
  if (current) {
    options.push({
      onSelect: () => game.assign(slot.id, null),
      content: h('div', { class: 'pick pick--empty' }, '자리 비우기'),
    });
  }
  openSheet({ title: `${slot.name} 배치`, subtitle: `${slot.description} · 주 능력치: ${STAT_LABELS[slot.mainStat]}`, options });
}

/** 카드를 눌렀을 때: 어느 슬롯에 넣을지 고른다 */
export function openSlotPicker(game: Game, card: CardDef): void {
  const state = game.state;
  const member = getMember(card.member)!;
  const lb = limitBreakOf(state, card.id);
  const baseRate = listenersPerSecond(state);
  openSheet({
    title: `${member.name} · ${card.title}`,
    subtitle: `${card.rarity} · 돌파 ${lb}단계 · 담당 슬롯에 배치하면 파워 +30%`,
    options: SLOTS.map((slot) => {
      const occupant = state.assignments[slot.id] ? getCard(state.assignments[slot.id]!) : undefined;
      const here = occupant?.id === card.id;
      return {
        selected: here,
        onSelect: () => game.assign(slot.id, here ? null : card.id),
        content: h(
          'div',
          { class: 'pick' },
          h('div', { class: 'pick__role' }, slot.name),
          h(
            'div',
            { class: 'pick__info' },
            h(
              'div',
              { class: 'pick__name' },
              `${STAT_LABELS[slot.mainStat]} 파워 ${Math.round(slotPower(card, lb, slot, equipBonuses(state)))}`,
              card.slot === slot.id ? h('span', { class: 'tag tag--slot is-active' }, '담당 +30%') : null,
            ),
            h('div', { class: 'pick__meta' }, here ? '탭하면 자리에서 내립니다' : occupant ? `현재: ${getMember(occupant.member)?.name} · ${occupant.title} (교체)` : '비어 있음'),
          ),
          here ? diffBadge(0, 0, '배치 중') : diffBadge(previewRateWith(state, slot.id, card.id), baseRate),
        ),
      };
    }),
  });
}
