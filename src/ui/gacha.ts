import { PICKUP_SHARE, pityOf, pullsUntilPity, rateTable, type PullResult } from '../core/gacha';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { activeBanners, getBanner, STANDARD_BANNER } from '../data/banners';
import { cardsOfRarity, getCard, type CardDef } from '../data/cards';
import { getMember } from '../data/members';
import { formatNumber } from '../utils/format';
import { cardFrame, rarityBadge } from './cardView';
import type { Component } from './component';
import { h, onTap } from './dom';
import { playPullAnimation } from './gachaShow';
import { openModal } from './modal';

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;

/** 남은 기간: "20일 3시간" / "5시간 12분" / "12분" */
function remaining(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(min / 1440);
  const hr = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}일 ${hr}시간`;
  if (hr > 0) return `${hr}시간 ${m}분`;
  return `${m}분`;
}

const dDay = (ms: number) => `D-${Math.max(0, Math.ceil(ms / 86_400_000))}`;

/** 뽑기 화면: 기간 한정 모집과 상시 모집 */
export function createGacha(game: Game, onResultsClosed: (results: PullResult[]) => void): Component {
  // 진행 중인 한정 모집이 있으면 그걸 먼저 보여 준다
  let selected = activeBanners()[0]?.id ?? STANDARD_BANNER;
  let lastBannerKey = '';

  const tabs = h('div', { class: 'banner-tabs', role: 'tablist' });
  const kicker = h('p', { class: 'gacha__kicker' });
  const title = h('h2', { class: 'gacha__title' });
  const desc = h('p', { class: 'gacha__desc' });
  const countdown = h('div', { class: 'gacha__countdown' });
  const showcase = h('div', { class: 'gacha__showcase' });
  const pickupNote = h('div', { class: 'gacha__pickup-note' });
  const stones = h('span', { class: 'gacha__stones-value' });
  const pityCount = h('strong', {});
  const pityRule = h('span', { class: 'gacha__pity-rule' });
  const pityFill = h('div', { class: 'progress__fill progress__fill--pity' });
  const singleBtn = pullButton('1회 뽑기', BALANCE.gacha.singleCost);
  const tenBtn = pullButton('10연 뽑기', BALANCE.gacha.tenCost, 'SR 이상 1장 확정');
  const ratesBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '확률표');
  onTap(ratesBtn, () => openRates(selected));

  async function doPull(count: 1 | 10) {
    const bannerId = selected;
    const results = game.pull(count, undefined, bannerId);
    if (!results) return;
    const again = await playPullAnimation(results, {
      canPullAgain: () => game.canPull(count) && game.bannerOpen(bannerId),
      againLabel: count === 10 ? '10연 한 번 더' : '한 번 더',
    });
    if (again) doPull(count);
    else onResultsClosed(results);
  }
  onTap(singleBtn, () => doPull(1));
  onTap(tenBtn, () => doPull(10));

  const banner = h(
    'div',
    { class: 'panel gacha__banner' },
    tabs,
    h('div', { class: 'gacha__head' }, h('div', {}, kicker, title, desc, countdown), ratesBtn),
    showcase,
    pickupNote,
    h('div', { class: 'gacha__pity' }, h('div', { class: 'gacha__pity-text' }, h('span', {}, 'SSR 확정까지 ', pityCount), pityRule), h('div', { class: 'progress' }, pityFill)),
    h('div', { class: 'gacha__wallet' }, h('span', { class: 'gem', 'aria-hidden': 'true' }), '보유 전파석 ', stones),
    h('div', { class: 'gacha__buttons' }, singleBtn, tenBtn),
  );
  const el = h('section', { class: 'gacha' }, banner);

  function renderTabs() {
    const list = [...activeBanners().map((b) => ({ id: b.id, label: `❄️ ${b.name}`, sub: dDay(b.end - Date.now()) })), { id: STANDARD_BANNER, label: '상시 모집', sub: '' }];
    tabs.replaceChildren(
      ...list.map((t) => {
        const btn = h('button', { class: `banner-tab${t.id === selected ? ' is-active' : ''}${t.id !== STANDARD_BANNER ? ' is-limited' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(t.id === selected) }, h('span', {}, t.label), t.sub ? h('small', {}, t.sub) : null);
        onTap(btn, () => {
          selected = t.id;
          renderBanner();
        });
        return btn;
      }),
    );
  }

  function fan(cards: CardDef[]) {
    showcase.replaceChildren(
      ...cards.map((card, i) => {
        const c = cardFrame(card, { size: 'md' });
        c.style.setProperty('--i', String(i - (cards.length - 1) / 2));
        return c;
      }),
    );
  }

  function renderBanner() {
    renderTabs();
    const b = selected === STANDARD_BANNER ? undefined : getBanner(selected);
    banner.classList.toggle('is-limited', !!b);
    if (b) {
      kicker.textContent = '기간 한정 모집';
      title.textContent = b.name;
      desc.textContent = b.subtitle;
      // SSR 픽업을 가운데에 오도록: SR, SSR, SSR, SR 순
      const pickups = b.pickups.map(getCard).filter((c): c is CardDef => !!c);
      const ssr = pickups.filter((c) => c.rarity === 'SSR');
      const rest = pickups.filter((c) => c.rarity !== 'SSR');
      fan([...rest.slice(0, Math.ceil(rest.length / 2)), ...ssr, ...rest.slice(Math.ceil(rest.length / 2))]);
      pickupNote.replaceChildren(
        h('span', { class: 'pickup-chip' }, 'PICK UP'),
        `SSR·SR이 나오면 ${Math.round(PICKUP_SHARE * 100)}% 확률로 픽업 카드 · ${BALANCE.gacha.pity}회 천장은 픽업 SSR 확정 · 천장 카운트는 이 모집 전용`,
      );
      pickupNote.hidden = false;
      pityRule.textContent = `${BALANCE.gacha.pity}회 안에 SSR이 없으면 픽업 SSR 확정`;
    } else {
      kicker.textContent = '상시 모집';
      title.textContent = '심야 엽서 뽑기';
      desc.textContent = '사연 엽서와 함께 새 부원 카드가 도착해요.';
      countdown.textContent = '';
      fan(cardsOfRarity('SSR'));
      pickupNote.hidden = true;
      pityRule.textContent = `${BALANCE.gacha.pity}회 안에 SSR이 없으면 확정`;
    }
  }

  return {
    el,
    render() {
      renderBanner();
    },
    tick() {
      const now = Date.now();
      // 모집이 끝나거나 새로 열리면 탭을 다시 그린다
      const key = activeBanners(now).map((b) => b.id).join('|');
      if (key !== lastBannerKey) {
        lastBannerKey = key;
        if (!game.bannerOpen(selected, now)) selected = activeBanners(now)[0]?.id ?? STANDARD_BANNER;
        renderBanner();
      }
      const b = selected === STANDARD_BANNER ? undefined : getBanner(selected);
      if (b) {
        const text = `남은 기간 ${remaining(b.end - now)}`;
        if (countdown.textContent !== text) countdown.textContent = text;
      }
      const s = game.state;
      stones.textContent = formatNumber(s.stones);
      pityCount.textContent = `${pullsUntilPity(s, selected)}회`;
      pityFill.style.width = `${(pityOf(s, selected) / BALANCE.gacha.pity) * 100}%`;
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

function cardRow(c: CardDef) {
  return h(
    'div',
    { class: 'rates__card' },
    cardFrame(c, { size: 'xs' }),
    h('div', {}, h('div', { class: 'rates__card-name' }, getMember(c.member)?.name ?? ''), h('div', { class: 'rates__card-title' }, c.title)),
  );
}

/** 확률표: 등급별 확률, 픽업·일반 카드 1장당 확률, 카드 목록 */
export function openRates(bannerId = STANDARD_BANNER): void {
  const banner = bannerId === STANDARD_BANNER ? undefined : getBanner(bannerId);
  const table = rateTable(bannerId);
  const body = h('div', { class: 'rates' });
  body.append(
    h(
      'table',
      { class: 'rates__table' },
      h('thead', {}, h('tr', {}, h('th', {}, '등급'), h('th', {}, '확률'), ...(banner ? [h('th', {}, '픽업 1장당')] : []), h('th', {}, banner ? '일반 1장당' : '카드 1장당'))),
      h(
        'tbody',
        {},
        ...table.map((r) =>
          h('tr', {}, h('td', {}, rarityBadge(r.rarity)), h('td', {}, pct(r.rate)), ...(banner ? [h('td', {}, r.pickups.length ? pct(r.perPickup, 2) : '-')] : []), h('td', {}, pct(r.perCard, 2))),
        ),
      ),
    ),
    h(
      'ul',
      { class: 'rates__rules' },
      ...(banner
        ? [
            h('li', {}, `기간: ${new Date(banner.start).toLocaleDateString('ko-KR')} ~ ${new Date(banner.end).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`),
            h('li', {}, `SSR·SR이 나오면 ${Math.round(PICKUP_SHARE * 100)}% 확률로 그 등급의 픽업 카드가 나와요. 한정 카드는 이 모집에서만 얻을 수 있어요.`),
            h('li', {}, `이 모집의 ${BALANCE.gacha.pity}회째 뽑기(마지막 SSR 이후)는 픽업 SSR이 확정이에요. 천장 카운트는 상시 모집과 따로 쌓여요.`),
          ]
        : [h('li', {}, `마지막 SSR 이후 ${BALANCE.gacha.pity}회째 뽑기는 SSR이 확정이에요. SSR이 나오면 0으로 돌아가요.`)]),
      h('li', {}, '10연 뽑기는 SR 이상 1장이 확정이에요. (앞 9장이 모두 R이면 10번째가 SR로 바뀝니다)'),
      h('li', {}, `같은 카드를 또 뽑으면 돌파 단계가 올라가요 (최대 ${BALANCE.limitBreak.max}). 단계마다 능력치 +${Math.round(BALANCE.limitBreak.statBonusPerLevel * 100)}%, 강화 최대 레벨 +${BALANCE.enhance.maxLevelPerLimitBreak}.`),
      h('li', {}, `최대 돌파 카드를 또 뽑으면 전파석으로 돌려받아요 (R ${BALANCE.limitBreak.overflowRefund.R} · SR ${BALANCE.limitBreak.overflowRefund.SR} · SSR ${BALANCE.limitBreak.overflowRefund.SSR}).`),
    ),
  );
  for (const r of table) {
    if (r.pickups.length) {
      body.append(h('h3', { class: 'rates__group' }, h('span', { class: 'pickup-chip' }, 'PICK UP'), rarityBadge(r.rarity), ` 장당 ${pct(r.perPickup, 2)}`), h('div', { class: 'rates__cards' }, ...r.pickups.map(cardRow)));
    }
    body.append(h('h3', { class: 'rates__group' }, rarityBadge(r.rarity), ` ${banner ? '일반' : pct(r.rate)} · 장당 ${pct(r.perCard, 2)}`), h('div', { class: 'rates__cards' }, ...r.cards.map(cardRow)));
  }
  openModal({ title: banner ? `확률표 · ${banner.name}` : '확률표 · 상시 모집', body, confirmLabel: '닫기', wide: true });
}
