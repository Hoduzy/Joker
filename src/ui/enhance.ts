import { cardStats, maxCardLevel, progressOf, slotPower } from '../core/economy';
import { equipBonuses } from '../core/equipment';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import type { CardDef } from '../data/cards';
import { getMember } from '../data/members';
import { SLOTS } from '../data/slots';
import { STAT_KEYS, STAT_LABELS } from '../data/stats';
import { formatNumber } from '../utils/format';
import { cardFrame, rarityBadge, slotName } from './cardView';
import { h, onTap } from './dom';
import { openModal } from './modal';

/**
 * 카드 강화 창. 창을 닫지 않고 연달아 강화할 수 있다.
 * 강화 비용은 청취자, 최대 레벨은 돌파 단계에 따라 오른다.
 */
export function openEnhance(game: Game, card: CardDef): void {
  const member = getMember(card.member)!;
  const body = h('div', { class: 'enh' });
  let unsubscribe: (() => void) | null = null;

  function render() {
    const owned = game.state.cards[card.id];
    if (!owned) return;
    const progress = progressOf(game.state, card.id);
    const max = maxCardLevel(owned.limitBreak);
    const cost = game.enhanceCost(card.id);
    const now = cardStats(card, progress);
    const next = cost !== null ? cardStats(card, { ...progress, level: progress.level + 1 }) : null;
    const slot = SLOTS.find((s) => s.id === card.slot)!;
    const bonus = equipBonuses(game.state);
    const powerNow = Math.round(slotPower(card, progress, slot, bonus));
    const powerNext = next ? Math.round(slotPower(card, { ...progress, level: progress.level + 1 }, slot, bonus)) : null;

    const btn = h('button', { class: 'btn btn--primary enh__btn', type: 'button', disabled: cost === null || !game.canEnhance(card.id) });
    if (cost === null) btn.append(h('span', {}, '최대 레벨'), h('span', { class: 'btn__sub' }, owned.limitBreak < BALANCE.limitBreak.max ? '돌파하면 최대 레벨이 올라가요' : '더 이상 강화할 수 없어요'));
    else btn.append(h('span', {}, `강화 → Lv.${progress.level + 1}`), h('span', { class: 'btn__sub' }, `청취자 ${formatNumber(cost)} (보유 ${formatNumber(game.state.listeners)})`));
    onTap(btn, () => game.enhance(card.id));
    const fill = h('div', { class: 'progress__fill' });
    fill.style.width = `${(progress.level / max) * 100}%`;
    body.replaceChildren(
      h(
        'div',
        { class: 'enh__top' },
        h('div', { class: 'enh__card' }, cardFrame(card, { size: 'md', limitBreak: owned.limitBreak, level: progress.level })),
        h(
          'div',
          { class: 'enh__info' },
          h('div', { class: 'detail__top' }, rarityBadge(card.rarity), h('strong', {}, member.name)),
          h('div', { class: 'enh__title' }, card.title),
          h('div', { class: 'enh__level' }, h('strong', {}, `Lv.${progress.level}`), h('span', {}, ` / ${max}`)),
          h('div', { class: 'progress' }, fill),
          h('div', { class: 'enh__power' }, `${slotName(card.slot)} 파워 ${powerNow}`, powerNext !== null ? h('span', { class: 'cmp__up' }, ` → ${powerNext}`) : null),
        ),
      ),
      h(
        'div',
        { class: 'enh__stats' },
        ...STAT_KEYS.map((k) =>
          h(
            'div',
            { class: 'detail__stat' },
            h('span', {}, STAT_LABELS[k]),
            h('strong', {}, String(now[k])),
            next ? h('span', { class: 'detail__next' }, `▲ ${next[k] - now[k]} → ${next[k]}`) : null,
          ),
        ),
      ),
      h('p', { class: 'enh__note' }, `레벨당 능력치 +${Math.round(BALANCE.enhance.statPerLevel * 100)}% · 최대 레벨은 돌파 1단계마다 +${BALANCE.enhance.maxLevelPerLimitBreak}`),
      btn,
    );
  }

  render();
  unsubscribe = game.on((e) => {
    if (e.type !== 'changed') return;
    if (!document.body.contains(body)) {
      unsubscribe?.();
      return;
    }
    render();
  });
  openModal({ title: '카드 강화', body, confirmLabel: '닫기', confirmGhost: true, wide: true, onConfirm: () => unsubscribe?.() });
}
