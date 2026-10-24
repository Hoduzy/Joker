import { pullsUntilPity, rateTable, type PullResult } from '../core/gacha';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { cardsOfRarity } from '../data/cards';
import { getMember } from '../data/members';
import { formatNumber } from '../utils/format';
import { cardFrame, rarityBadge } from './cardView';
import type { Component } from './component';
import { h, onTap } from './dom';
import { playPullAnimation } from './gachaShow';
import { openModal } from './modal';

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;

/** 뽑기 화면 */
export function createGacha(game: Game, onResultsClosed: (results: PullResult[]) => void): Component {
  const stones = h('span', { class: 'gacha__stones-value' });
  const pityCount = h('strong', {});
  const pityFill = h('div', { class: 'progress__fill progress__fill--pity' });
  const singleBtn = pullButton('1회 뽑기', BALANCE.gacha.singleCost);
  const tenBtn = pullButton('10연 뽑기', BALANCE.gacha.tenCost, 'SR 이상 1장 확정');
  const ratesBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '확률표');
  onTap(ratesBtn, openRates);

  async function doPull(count: 1 | 10) {
    const results = game.pull(count);
    if (!results) return;
    const again = await playPullAnimation(results, {
      canPullAgain: () => game.canPull(count),
      againLabel: count === 10 ? '10연 한 번 더' : '한 번 더',
    });
    if (again) doPull(count);
    else onResultsClosed(results);
  }
  onTap(singleBtn, () => doPull(1));
  onTap(tenBtn, () => doPull(10));

  // 픽업 전시: SSR 카드들을 부채꼴로
  const showcase = h('div', { class: 'gacha__showcase' });
  const ssrCards = cardsOfRarity('SSR');
  ssrCards.forEach((card, i) => {
    const c = cardFrame(card, { size: 'md' });
    const mid = (ssrCards.length - 1) / 2;
    c.style.setProperty('--i', String(i - mid));
    showcase.append(c);
  });

  const el = h(
    'section',
    { class: 'gacha' },
    h(
      'div',
      { class: 'panel gacha__banner' },
      h(
        'div',
        { class: 'gacha__head' },
        h('div', {}, h('p', { class: 'gacha__kicker' }, '상시 모집'), h('h2', { class: 'gacha__title' }, '심야 엽서 뽑기'), h('p', { class: 'gacha__desc' }, '사연 엽서와 함께 새 부원 카드가 도착해요.')),
        ratesBtn,
      ),
      showcase,
      h(
        'div',
        { class: 'gacha__pity' },
        h('div', { class: 'gacha__pity-text' }, h('span', {}, 'SSR 확정까지 ', pityCount), h('span', { class: 'gacha__pity-rule' }, `${BALANCE.gacha.pity}회 안에 SSR이 없으면 확정`)),
        h('div', { class: 'progress' }, pityFill),
      ),
      h('div', { class: 'gacha__wallet' }, h('span', { class: 'gem', 'aria-hidden': 'true' }), '보유 전파석 ', stones),
      h('div', { class: 'gacha__buttons' }, singleBtn, tenBtn),
    ),
  );

  return {
    el,
    render() {},
    tick() {
      const s = game.state;
      stones.textContent = formatNumber(s.stones);
      const left = pullsUntilPity(s);
      pityCount.textContent = `${left}회`;
      pityFill.style.width = `${(s.gacha.pity / BALANCE.gacha.pity) * 100}%`;
      setDisabled(singleBtn, !game.canPull(1));
      setDisabled(tenBtn, !game.canPull(10));
    },
  };
}

function pullButton(label: string, cost: number, note?: string): HTMLButtonElement {
  return h(
    'button',
    { class: 'btn btn--primary gacha__pull', type: 'button' },
    h('span', { class: 'gacha__pull-label' }, label),
    h('span', { class: 'btn__sub' }, h('span', { class: 'gem gem--sm', 'aria-hidden': 'true' }), ` ${cost.toLocaleString('ko-KR')}`),
    note ? h('span', { class: 'gacha__pull-note' }, note) : null,
  );
}

function setDisabled(btn: HTMLButtonElement, disabled: boolean) {
  if (btn.disabled !== disabled) btn.disabled = disabled;
}

/** 확률표: 등급별 확률, 카드 1장당 확률, 카드 목록 */
export function openRates(): void {
  const body = h('div', { class: 'rates' });
  body.append(
    h(
      'table',
      { class: 'rates__table' },
      h('thead', {}, h('tr', {}, h('th', {}, '등급'), h('th', {}, '확률'), h('th', {}, '카드 1장당'), h('th', {}, '카드 수'))),
      h(
        'tbody',
        {},
        ...rateTable().map((r) => h('tr', {}, h('td', {}, rarityBadge(r.rarity)), h('td', {}, pct(r.rate)), h('td', {}, pct(r.perCard, 2)), h('td', {}, `${r.cards.length}장`))),
      ),
    ),
    h(
      'ul',
      { class: 'rates__rules' },
      h('li', {}, `10연 뽑기는 SR 이상 1장이 확정이에요. (앞 9장이 모두 R이면 10번째가 SR로 바뀝니다)`),
      h('li', {}, `마지막 SSR 이후 ${BALANCE.gacha.pity}회째 뽑기는 SSR이 확정이에요. 천장 카운트는 뽑기 화면에 표시되고, SSR이 나오면 0으로 돌아가요.`),
      h('li', {}, `같은 카드를 또 뽑으면 돌파 단계가 올라가요 (최대 ${BALANCE.limitBreak.max}). 단계마다 능력치 +${Math.round(BALANCE.limitBreak.statBonusPerLevel * 100)}%.`),
      h('li', {}, `최대 돌파 카드를 또 뽑으면 전파석으로 돌려받아요 (R ${BALANCE.limitBreak.overflowRefund.R} · SR ${BALANCE.limitBreak.overflowRefund.SR} · SSR ${BALANCE.limitBreak.overflowRefund.SSR}).`),
    ),
  );
  for (const r of rateTable()) {
    body.append(
      h('h3', { class: 'rates__group' }, rarityBadge(r.rarity), ` ${pct(r.rate)} · 장당 ${pct(r.perCard, 2)}`),
      h(
        'div',
        { class: 'rates__cards' },
        ...r.cards.map((c) => h('div', { class: 'rates__card' }, cardFrame(c, { size: 'xs' }), h('div', {}, h('div', { class: 'rates__card-name' }, getMember(c.member)?.name ?? ''), h('div', { class: 'rates__card-title' }, c.title)))),
      ),
    );
  }
  openModal({ title: '확률표', body, confirmLabel: '닫기', wide: true });
}
