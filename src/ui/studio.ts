import { formatNumber } from '../utils/format';
import { isFullLineup, limitBreakOf, progressOf, slotPower } from '../core/economy';
import { equipBonuses } from '../core/equipment';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { getMember } from '../data/members';
import { SLOTS, type SlotDef } from '../data/slots';
import { STAT_LABELS } from '../data/stats';
import { getCorner } from '../data/flavor';
import { openCardPicker } from './assign';
import { lbPips, rarityBadge } from './cardView';
import type { Component } from './component';
import { h, memberSd, onTap, patchChildren } from './dom';

export interface Studio extends Component {
  /** 배치된 부원 머리 위에 말풍선을 띄운다. 배치되어 있지 않으면 false */
  say(memberId: string, text: string, ms: number): boolean;
  /** 배치된 부원 SD가 한 번 폴짝 (방송사고 복구 등) */
  cheer(memberId: string): void;
}

/** 방송 슬롯 4개(DJ/엔지니어/작가/게스트). 카드 단위로 배치한다. */
export function createStudio(game: Game, onPoke: (memberId: string) => void): Studio {
  const grid = h('div', { class: 'slots' });
  // 슬롯을 다시 그려도 말풍선이 사라지지 않게 별도 층에 둔다
  const bubbles = h('div', { class: 'bubbles', 'aria-live': 'polite' });
  const bubbleTimers = new Map<string, number>();
  const bonus = h('p', { class: 'studio__bonus' });
  const el = h(
    'section',
    { class: 'panel studio' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '오늘의 방송'), bonus),
    h('div', { class: 'slots-wrap' }, grid, bubbles),
  );

  function renderSlot(slot: SlotDef): HTMLElement {
    if (!game.slotUnlocked(slot.id)) {
      // 아직 안 열린 자리: 갓 생긴 방송부라 사람이 없다
      const at = BALANCE.unlocks.slots[slot.id];
      return h(
        'div',
        { class: 'slot slot--locked', 'aria-label': `${slot.name} 자리 (잠김)` },
        h('div', { class: 'slot__role' }, slot.name),
        h('div', { class: 'slot__stage' }, h('div', { class: 'slot__lock' }, '🔒')),
        h('div', { class: 'slot__name' }, '빈 자리'),
        h('div', { class: 'slot__power' }, `누적 청취자 ${formatNumber(at)}명에 열려요`),
      );
    }
    const cardId = game.state.assignments[slot.id];
    const card = cardId ? getCard(cardId) : undefined;
    const member = card ? getMember(card.member) : undefined;
    const corner = getCorner(game.state.corner.id);
    const role = h(
      'div',
      { class: 'slot__role' },
      slot.name,
      h('span', { class: 'slot__stat' }, STAT_LABELS[slot.mainStat]),
      corner?.slot === slot.id ? h('span', { class: 'slot__corner', title: `오늘의 코너: ${corner.name}` }, `${corner.emoji} 코너`) : null,
    );

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
    const stage = h('button', { class: 'slot__stage', type: 'button', 'aria-label': `${member.name}에게 말 걸기` }, memberSd(member, card.outfit));
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
      h('div', { class: 'slot__name' }, member.name, rarityBadge(card.rarity), h('span', { class: 'slot__lv' }, `Lv.${game.state.cards[card.id]?.level ?? 1}`)),
      h('div', { class: 'slot__card' }, card.title),
      h(
        'div',
        { class: 'slot__power' },
        `파워 ${Math.round(slotPower(card, progressOf(game.state, card.id), slot, equipBonuses(game.state)))}`,
        matched ? h('span', { class: 'tag tag--slot is-active' }, '담당 +30%') : null,
      ),
      lb > 0 ? lbPips(lb) : null,
      change,
    );
    el.style.setProperty('--member-color', member.color);
    return el;
  }

  function say(memberId: string, text: string, ms: number): boolean {
    const index = SLOTS.findIndex((s) => {
      const id = game.state.assignments[s.id];
      return id && getCard(id)?.member === memberId;
    });
    const slotEl = grid.children[index] as HTMLElement | undefined;
    if (index < 0 || !slotEl) return false;
    bubbles.querySelector(`[data-member="${memberId}"]`)?.remove();
    const bubble = h('div', { class: 'bubble', 'data-member': memberId }, text);
    const center = slotEl.offsetLeft + slotEl.offsetWidth / 2;
    // 역할 이름 줄 아래, SD 머리 위쯤
    bubble.style.top = `${slotEl.offsetTop + 56}px`;
    bubbles.append(bubble);
    // 좁은 화면에서 말풍선이 밖으로 나가지 않게 가로 위치를 안쪽으로 당기고, 꼬리는 그 부원을 가리키게
    const half = bubble.offsetWidth / 2;
    const left = Math.min(Math.max(center, half), bubbles.clientWidth - half);
    bubble.style.left = `${left}px`;
    bubble.style.setProperty('--tail', `${center - left}px`);
    window.clearTimeout(bubbleTimers.get(memberId));
    bubbleTimers.set(
      memberId,
      window.setTimeout(() => {
        bubble.classList.add('is-out');
        setTimeout(() => bubble.remove(), 250);
      }, ms),
    );
    return true;
  }

  function cheer(memberId: string): void {
    const index = SLOTS.findIndex((s) => {
      const id = game.state.assignments[s.id];
      return id && getCard(id)?.member === memberId;
    });
    const stage = (grid.children[index] as HTMLElement | undefined)?.querySelector('.slot__stage');
    if (!stage) return;
    stage.classList.remove('is-bounce');
    void (stage as HTMLElement).offsetWidth;
    stage.classList.add('is-bounce');
  }

  return {
    el,
    say,
    cheer,
    render() {
      patchChildren(grid, SLOTS.map(renderSlot));
      // 배치가 바뀌어 자리가 없어진 부원의 말풍선 정리
      for (const b of [...bubbles.children] as HTMLElement[]) {
        const memberId = b.dataset.member;
        const stillOn = SLOTS.some((s) => {
          const id = game.state.assignments[s.id];
          return id && getCard(id)?.member === memberId;
        });
        if (!stillOn) b.remove();
      }
      const full = isFullLineup(game.state);
      const pct = Math.round((BALANCE.fullLineupBonus - 1) * 100);
      const open = SLOTS.filter((sl) => game.slotUnlocked(sl.id)).length;
      bonus.textContent = full
        ? `풀 라인업 보너스 +${pct}%`
        : open < SLOTS.length
          ? `열린 자리 ${open} / ${SLOTS.length}`
          : `4명 모두 배치 시 +${pct}%`;
      bonus.classList.toggle('is-active', full);
    },
  };
}
