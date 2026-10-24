import { BALANCE } from '../data/balance';
import type { CardDef, Rarity } from '../data/cards';
import { getMember } from '../data/members';
import { cardArtUrl } from '../data/portraits';
import { SLOTS, type SlotId } from '../data/slots';
import { h } from './dom';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

export interface CardFrameOptions {
  size?: CardSize;
  /** false면 실루엣(미보유) */
  owned?: boolean;
  limitBreak?: number;
}

/**
 * 카드 그림. 전용 일러스트가 없으면 부원 전신 이미지 위쪽을 잘라 쓰고,
 * 등급별 테두리(R 은색 · SR 금색 · SSR 무지개)를 씌운다.
 */
export function cardFrame(card: CardDef, opts: CardFrameOptions = {}): HTMLElement {
  const { size = 'md', owned = true, limitBreak } = opts;
  const member = getMember(card.member);
  const art = cardArtUrl(card.id, card.member);
  const inner = h('div', { class: 'cardf__inner' });
  if (art.url) {
    inner.append(h('img', { class: `cardf__art${art.dedicated ? ' is-dedicated' : ''}`, src: art.url, alt: owned ? `${member?.name} ${card.title}` : '미획득 카드', draggable: 'false', loading: 'lazy' }));
  }
  if (!owned) inner.append(h('div', { class: 'cardf__unknown' }, '?'));

  const el = h('div', { class: `cardf cardf--${card.rarity} cardf--${size}${owned ? '' : ' is-locked'}` }, inner, rarityBadge(card.rarity));
  el.style.setProperty('--member-color', member?.color ?? '#888');

  if (size === 'md' || size === 'lg') {
    el.append(
      h(
        'div',
        { class: 'cardf__caption' },
        h('div', { class: 'cardf__title' }, owned ? card.title : '???'),
        h('div', { class: 'cardf__name' }, owned ? (member?.name ?? '') : ''),
        owned && limitBreak !== undefined ? lbPips(limitBreak) : null,
      ),
    );
  }
  return el;
}

export function rarityBadge(rarity: Rarity): HTMLElement {
  return h('span', { class: `rarity rarity--${rarity}` }, rarity);
}

/** 돌파 단계 표시 ◆◆◇◇◇ */
export function lbPips(limitBreak: number): HTMLElement {
  const el = h('span', { class: 'lb', 'aria-label': `돌파 ${limitBreak}/${BALANCE.limitBreak.max}` });
  for (let i = 0; i < BALANCE.limitBreak.max; i++) el.append(h('i', { class: i < limitBreak ? 'is-on' : '' }));
  return el;
}

export function slotName(id: SlotId): string {
  return SLOTS.find((s) => s.id === id)?.name ?? id;
}

/** 담당 슬롯 태그. active면 지금 그 슬롯에 있어 보너스가 적용 중 */
export function slotTag(id: SlotId, active = false): HTMLElement {
  return h('span', { class: `tag tag--slot${active ? ' is-active' : ''}` }, `담당 ${slotName(id)}`);
}
