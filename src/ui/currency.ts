import type { EventDef, EventRewards } from '../data/events';
import { uiIconUrl } from '../data/events';
import { h } from './dom';

/** 이벤트 한정 재화 아이콘 (assets/ui/<icon>.png). 그림이 없으면 🍬 */
export function currencyIcon(ev: EventDef, size: 'sm' | 'md' | 'lg' = 'sm'): HTMLElement {
  const url = uiIconUrl(ev.currency.icon);
  return url
    ? h('img', { class: `cur-icon cur-icon--${size}`, src: url, alt: ev.currency.name, draggable: 'false' })
    : h('span', { class: `cur-icon cur-icon--${size} cur-icon--emoji`, 'aria-label': ev.currency.name }, '🍬');
}

/** "🍬 +15" 칩 (아이콘 + 수) */
export function currencyChip(ev: EventDef, amount: number, plus = true): HTMLElement {
  return h('span', { class: 'cur-chip' }, currencyIcon(ev), `${plus ? '+' : ''}${amount.toLocaleString('ko-KR')}`);
}

/** 미션 보상 칩들: 사탕(아이콘) · 💎 · 🎫 · 🔧 */
export function rewardChips(ev: EventDef, r: EventRewards): HTMLElement {
  return h(
    'span',
    { class: 'cur-rewards' },
    r.candy ? currencyChip(ev, r.candy, false) : null,
    r.stones ? h('span', { class: 'cur-chip' }, h('span', { class: 'gem gem--sm', 'aria-hidden': 'true' }), String(r.stones)) : null,
    r.tickets ? h('span', { class: 'cur-chip' }, `🎫 ${r.tickets}`) : null,
    r.kits ? h('span', { class: 'cur-chip' }, `🔧 ${r.kits}`) : null,
  );
}
