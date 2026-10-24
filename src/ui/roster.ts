import { listenersPerSecond, previewRateWith, slotPower } from '../core/economy';
import type { Game } from '../core/game';
import { getMember, type MemberDef } from '../data/members';
import { SLOTS } from '../data/slots';
import { STAT_KEYS, STAT_LABELS } from '../data/stats';
import { formatRate } from '../utils/format';
import type { Component } from './component';
import { h, onTap, portrait } from './dom';
import { openSheet } from './sheet';

function rateDiffBadge(next: number, current: number): HTMLElement {
  const cls = next > current ? 'is-up' : next < current ? 'is-down' : '';
  return h('span', { class: `pick__diff ${cls}` }, `→ ${formatRate(next)}/초`);
}

/** 보유 부원 목록. 부원을 탭하면 배치할 슬롯을 고른다. */
export function createRoster(game: Game): Component {
  const list = h('div', { class: 'roster' });
  const el = h('section', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '부원')), list);

  function openSlotPicker(m: MemberDef) {
    const state = game.state;
    const baseRate = listenersPerSecond(state);
    openSheet({
      title: `${m.name} 배치`,
      subtitle: m.tagline,
      options: SLOTS.map((slot) => {
        const occupantId = state.assignments[slot.id];
        const occupant = occupantId ? getMember(occupantId) : undefined;
        const here = occupantId === m.id;
        return {
          selected: here,
          onSelect: () => game.assign(slot.id, here ? null : m.id),
          content: h(
            'div',
            { class: 'pick' },
            h('div', { class: 'pick__role' }, slot.name),
            h(
              'div',
              { class: 'pick__info' },
              h('div', { class: 'pick__name' }, `${STAT_LABELS[slot.mainStat]} ${m.stats[slot.mainStat]} · 파워 ${Math.round(slotPower(m, slot))}`),
              h('div', { class: 'pick__meta' }, here ? '탭하면 자리에서 내립니다' : occupant ? `현재: ${occupant.name} (교체)` : '비어 있음'),
            ),
            here
              ? h('span', { class: 'pick__diff' }, '배치 중')
              : rateDiffBadge(previewRateWith(state, slot.id, m.id), baseRate),
          ),
        };
      }),
    });
  }

  function renderMember(m: MemberDef): HTMLElement {
    const slot = SLOTS.find((s) => game.state.assignments[s.id] === m.id);
    const stats = h(
      'div',
      { class: 'stats' },
      ...STAT_KEYS.map((key) => {
        const fill = h('div', { class: 'stat__fill' });
        fill.style.width = `${Math.min(100, (m.stats[key] / 40) * 100)}%`;
        return h('div', { class: 'stat' }, h('span', { class: 'stat__label' }, STAT_LABELS[key]), h('div', { class: 'stat__bar' }, fill), h('span', { class: 'stat__value' }, String(m.stats[key])));
      }),
    );
    const card = h(
      'button',
      { class: `member${slot ? ' is-assigned' : ''}`, type: 'button' },
      portrait(m.color, m.name, 'md'),
      h(
        'div',
        { class: 'member__body' },
        h('div', { class: 'member__top' }, h('span', { class: 'member__name' }, m.name), h('span', { class: `rarity rarity--${m.rarity}` }, m.rarity), slot ? h('span', { class: 'tag tag--on' }, slot.name) : null),
        h('div', { class: 'member__tagline' }, m.tagline),
        stats,
      ),
    );
    onTap(card, () => openSlotPicker(m));
    return card;
  }

  return {
    el,
    render() {
      const members = game.state.ownedMembers.map(getMember).filter((m): m is MemberDef => !!m);
      list.replaceChildren(...members.map(renderMember));
    },
  };
}
