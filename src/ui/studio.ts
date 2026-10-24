import { isFullLineup, listenersPerSecond, previewRateWith, slotPower } from '../core/economy';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getMember } from '../data/members';
import { SLOTS, type SlotDef } from '../data/slots';
import { STAT_LABELS } from '../data/stats';
import { formatRate } from '../utils/format';
import type { Component } from './component';
import { h, memberFace, memberSd, onTap } from './dom';
import { openSheet } from './sheet';

/** 방송 슬롯 4개(DJ/엔지니어/작가/게스트) */
export function createStudio(game: Game, onPoke: (memberId: string) => void): Component {
  const grid = h('div', { class: 'slots' });
  const bonus = h('p', { class: 'studio__bonus' });
  const el = h(
    'section',
    { class: 'panel studio' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '오늘의 방송'), bonus),
    grid,
  );

  function openPicker(slot: SlotDef) {
    const state = game.state;
    const current = state.assignments[slot.id];
    const baseRate = listenersPerSecond(state);
    const options = state.ownedMembers.map((id) => {
      const m = getMember(id)!;
      const otherSlot = SLOTS.find((s) => s.id !== slot.id && state.assignments[s.id] === id);
      const diff = previewRateWith(state, slot.id, id) - baseRate;
      return {
        selected: current === id,
        onSelect: () => game.assign(slot.id, id),
        content: h(
          'div',
          { class: 'pick' },
          memberFace(m, 'neutral', 'sm'),
          h(
            'div',
            { class: 'pick__info' },
            h('div', { class: 'pick__name' }, m.name, h('span', { class: `rarity rarity--${m.rarity}` }, m.rarity)),
            h(
              'div',
              { class: 'pick__meta' },
              `${STAT_LABELS[slot.mainStat]} ${m.stats[slot.mainStat]} · 파워 ${Math.round(slotPower(m, slot))}`,
              otherSlot ? h('span', { class: 'tag' }, `${otherSlot.name}에서 이동`) : null,
            ),
          ),
          current === id
            ? h('span', { class: 'pick__diff' }, '배치 중')
            : h('span', { class: `pick__diff ${diff >= 0 ? 'is-up' : 'is-down'}` }, `${diff >= 0 ? '+' : ''}${formatRate(diff)}/초`),
        ),
      };
    });
    if (current) {
      options.push({
        selected: false,
        onSelect: () => game.assign(slot.id, null),
        content: h('div', { class: 'pick pick--empty' }, '자리 비우기'),
      });
    }
    openSheet({
      title: `${slot.name} 배치`,
      subtitle: `${slot.description} · 주 능력치: ${STAT_LABELS[slot.mainStat]}`,
      options,
    });
  }

  function renderSlot(slot: SlotDef): HTMLElement {
    const id = game.state.assignments[slot.id];
    const m = id ? getMember(id) : undefined;
    const role = h('div', { class: 'slot__role' }, slot.name, h('span', { class: 'slot__stat' }, STAT_LABELS[slot.mainStat]));

    if (!m) {
      const empty = h(
        'button',
        { class: 'slot slot--empty', type: 'button' },
        role,
        h('div', { class: 'slot__stage' }, h('div', { class: 'slot__plus' }, '+')),
        h('div', { class: 'slot__name' }, '비어 있음'),
        h('div', { class: 'slot__power' }, '탭해서 배치'),
      );
      onTap(empty, () => openPicker(slot));
      return empty;
    }

    // SD를 탭하면 대사, 아래 버튼으로 교체
    const stage = h('button', { class: 'slot__stage', type: 'button', 'aria-label': `${m.name}에게 말 걸기` }, memberSd(m));
    onTap(stage, () => {
      stage.classList.remove('is-bounce');
      void stage.offsetWidth;
      stage.classList.add('is-bounce');
      onPoke(m.id);
    });
    const change = h('button', { class: 'slot__change', type: 'button' }, '교체');
    onTap(change, () => openPicker(slot));
    const card = h(
      'div',
      { class: 'slot' },
      role,
      stage,
      h('div', { class: 'slot__name' }, m.name, h('span', { class: 'slot__power' }, ` · 파워 ${Math.round(slotPower(m, slot))}`)),
      change,
    );
    card.style.setProperty('--member-color', m.color);
    return card;
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
