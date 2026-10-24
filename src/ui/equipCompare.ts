import { listenersPerSecond } from '../core/economy';
import { compareRows, equipBonuses, itemPart, itemPower, salvageReward, type EquipItem } from '../core/equipment';
import type { Game } from '../core/game';
import { getPart } from '../data/equipment';
import { STAT_LABELS } from '../data/stats';
import { formatRate } from '../utils/format';
import { h } from './dom';
import { equipCard, fmtPct } from './equipView';
import { openModal } from './modal';
import { gemIcon, toast } from './toast';

function arrow(diff: number): HTMLElement {
  if (diff > 0) return h('span', { class: 'cmp__up' }, `▲ ${fmtNum(diff)}`);
  if (diff < 0) return h('span', { class: 'cmp__down' }, `▼ ${fmtNum(-diff)}`);
  return h('span', { class: 'cmp__same' }, '—');
}

const fmtNum = (v: number) => (Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toFixed(1));

/**
 * 새 장비와 지금 낀 같은 부위 장비를 나란히 비교한다.
 * 교체하면 기존 장비는 분해되고, 분해하면 새 장비를 분해한다.
 */
export function openCompare(game: Game, item: EquipItem, onDone?: () => void): void {
  const state = game.state;
  const part = itemPart(item);
  const current = state.equipment[part] ?? null;
  const salvagePct = equipBonuses(state).salvagePct;
  const newReward = salvageReward(item, salvagePct);
  const oldReward = current ? salvageReward(current, salvagePct) : null;

  const rows = compareRows(item, current, STAT_LABELS);
  const powerBefore = itemPower(current);
  const powerAfter = itemPower(item);
  const rateBefore = listenersPerSecond(state);
  const rateAfter = listenersPerSecond({ ...state, equipment: { ...state.equipment, [part]: item } });

  const table = h(
    'table',
    { class: 'cmp__table' },
    h('thead', {}, h('tr', {}, h('th', {}, '항목'), h('th', {}, '현재'), h('th', {}, '새 장비'), h('th', {}, '변화'))),
    h(
      'tbody',
      {},
      ...rows.map((r) => {
        const show = (v: number) => (v ? (r.unit === '%' ? `+${fmtPct(v)}` : `+${v}`) : '-');
        return h('tr', {}, h('td', {}, r.label), h('td', {}, show(r.before)), h('td', {}, show(r.after)), h('td', {}, arrow(Math.round((r.after - r.before) * 10) / 10)));
      }),
    ),
  );

  const powerDiff = powerAfter - powerBefore;
  const body = h(
    'div',
    { class: 'cmp' },
    h('div', { class: 'cmp__cards' }, equipCard(current, part, '현재 장착'), h('div', { class: 'cmp__vs' }, '→'), equipCard(item, part, '새 장비')),
    table,
    h(
      'div',
      { class: `cmp__total ${powerDiff > 0 ? 'is-up' : powerDiff < 0 ? 'is-down' : ''}` },
      h('span', {}, '총 전투력'),
      h('strong', {}, `${powerBefore.toLocaleString('ko-KR')} → ${powerAfter.toLocaleString('ko-KR')}`),
      arrow(powerDiff),
    ),
    rateBefore > 0 || rateAfter > 0 ? h('div', { class: 'cmp__rate' }, `초당 청취자 ${formatRate(rateBefore)} → ${formatRate(rateAfter)}`) : null,
    h(
      'div',
      { class: 'cmp__notes' },
      h('span', {}, '분해: ', gemIcon(), ` ${newReward.stones} · 부품 ${newReward.parts}`),
      h('span', {}, current && oldReward ? `교체하면 기존 장비 분해: 전파석 ${oldReward.stones} · 부품 ${oldReward.parts}` : `${getPart(part)?.name} 칸이 비어 있어요`),
    ),
  );

  openModal({
    title: '협찬 택배 도착!',
    body,
    wide: true,
    panelClass: 'modal__panel--compare',
    cancelLabel: '분해',
    confirmLabel: current ? '교체' : '장착',
    onCancel: () => {
      const r = game.salvagePending();
      toast(`분해 완료 · 전파석 +${r.stones} · 부품 +${r.parts}`, gemIcon());
      onDone?.();
    },
    onConfirm: () => {
      const r = game.equipPending();
      toast(current ? `교체 완료 · 기존 장비 분해 (전파석 +${r.stones} · 부품 +${r.parts})` : '장착 완료!');
      onDone?.();
    },
  });
}
