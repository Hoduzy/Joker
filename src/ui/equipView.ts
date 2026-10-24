import { itemPower, itemStat, type EquipItem } from '../core/equipment';
import { getGrade, getItemDef, getPart, getSubOption } from '../data/equipment';
import { STAT_LABELS } from '../data/stats';
import { h } from './dom';

export function gradeColor(gradeId: string): string {
  return getGrade(gradeId)?.color ?? '#888';
}

export const fmtPct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;

/** 장비 아이콘 타일 (등급 색 테두리). item이 없으면 빈 칸 */
export function equipTile(item: EquipItem | null, partId: string, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const part = getPart(partId);
  const el = h('div', { class: `etile etile--${size}${item ? '' : ' is-empty'}` }, h('span', { class: 'etile__icon', 'aria-hidden': 'true' }, part?.icon ?? '📦'));
  if (item) {
    el.style.setProperty('--grade', gradeColor(item.grade));
    el.append(h('span', { class: 'etile__grade' }, getGrade(item.grade)?.name ?? ''));
  }
  return el;
}

/** 장비 상세 카드: 아이콘, 이름, 등급, 주 스탯, 부가옵션, 전투력 */
export function equipCard(item: EquipItem | null, partId: string, label?: string): HTMLElement {
  const part = getPart(partId);
  if (!item) {
    return h(
      'div',
      { class: 'ecard is-empty' },
      label ? h('div', { class: 'ecard__label' }, label) : null,
      equipTile(null, partId, 'lg'),
      h('div', { class: 'ecard__name' }, `${part?.name ?? ''} 비어 있음`),
    );
  }
  const def = getItemDef(item.item);
  const grade = getGrade(item.grade);
  const el = h(
    'div',
    { class: 'ecard' },
    label ? h('div', { class: 'ecard__label' }, label) : null,
    equipTile(item, partId, 'lg'),
    h('div', { class: 'ecard__grade' }, `${grade?.name} · ${part?.name} · 택배 Lv.${item.boxLevel}`),
    h('div', { class: 'ecard__name' }, def?.name ?? item.item),
    h('div', { class: 'ecard__main' }, `${STAT_LABELS[itemStat(item)]} +${item.main}`),
    h(
      'ul',
      { class: 'ecard__subs' },
      ...(item.subs.length ? item.subs.map((s) => h('li', {}, `${getSubOption(s.id)?.name ?? s.id} +${fmtPct(s.value)}`)) : [h('li', { class: 'is-none' }, '부가옵션 없음')]),
    ),
    h('div', { class: 'ecard__power' }, `전투력 ${itemPower(item).toLocaleString('ko-KR')}`),
  );
  el.style.setProperty('--grade', gradeColor(item.grade));
  return el;
}

