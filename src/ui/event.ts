import type { Game } from '../core/game';
import { eventPullCost, eventTimeLeft, shopBought } from '../core/events';
import type { PullResult } from '../core/gacha';
import { cardsOfRarity, getCard, type CardDef, type Rarity } from '../data/cards';
import type { EventDef, EventMission, ShopItem } from '../data/events';
import { dayKey } from '../data/flavor';
import { getMember } from '../data/members';
import { getPortraits } from '../data/portraits';
import { formatNumber } from '../utils/format';
import { bgmWhile } from './audio';
import { cardFrame, rarityBadge } from './cardView';
import type { Component } from './component';
import { currencyChip, currencyIcon, rewardChips } from './currency';
import { h, onTap } from './dom';
import { startEventBattle } from './dungeon';
import { playPullAnimation } from './gachaShow';
import { openModal } from './modal';
import { sfx } from './sfx';
import { eventEpisodeRow } from './storyView';
import { toast } from './toast';

/** 남은 시간: "3일 4시간" / "5시간 12분" / "12분 30초" */
export function eventRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}일 ${hr}시간`;
  if (hr > 0) return `${hr}시간 ${m}분`;
  return `${m}분 ${s % 60}초`;
}

const pct = (v: number) => `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

/**
 * 메인 화면 이벤트 배너: 이름·남은 시간·보유 사탕, 이벤트 화면으로 가는 버튼.
 * 이벤트 중에는 body에 theme-<테마> 클래스와 작은 장식(호박·박쥐)을 붙인다
 */
export function createEventBanner(game: Game, onResultsClosed: (results: PullResult[]) => void): Component {
  const title = h('strong', { class: 'ev-banner__title' });
  const sub = h('span', { class: 'ev-banner__sub' });
  const time = h('span', { class: 'ev-banner__time' });
  const candy = h('span', { class: 'ev-banner__candy' });
  const badge = h('span', { class: 'badge ev-banner__badge', hidden: true });
  const open = h('button', { class: 'btn btn--primary ev-banner__open', type: 'button' }, '이벤트 열기', badge);
  const deco = h('div', { class: 'ev-deco', 'aria-hidden': 'true' }, ...['🎃', '🦇', '🦇', '🎃', '🦇'].map((e, i) => h('i', { class: `ev-deco__${i}` }, e)));
  const el = h(
    'section',
    { class: 'ev-banner', hidden: true },
    h('div', { class: 'ev-banner__art', 'aria-hidden': 'true' }),
    h('div', { class: 'ev-banner__text' }, h('span', { class: 'ev-banner__kicker' }, '🎃 기간 한정 이벤트'), title, sub, h('div', { class: 'ev-banner__meta' }, time, candy)),
    open,
  );
  onTap(open, () => openEventHub(game, 'gacha', onResultsClosed));
  let theme = '';
  let evId = '';

  const sync = () => {
    const ev = game.event();
    const want = ev ? `theme-${ev.theme}` : '';
    if (want !== theme) {
      if (theme) document.body.classList.remove(theme);
      if (want) document.body.classList.add(want);
      theme = want;
      if (want) document.body.append(deco);
      else deco.remove();
    }
    el.hidden = !ev;
    if (!ev) return;
    if (ev.id !== evId) {
      evId = ev.id;
      title.textContent = ev.name;
      sub.textContent = ev.subtitle;
      const art = el.querySelector('.ev-banner__art') as HTMLElement;
      art.replaceChildren(
        ...ev.cards
          .map((id) => getCard(id))
          .filter((c): c is CardDef => !!c)
          .map((c) => {
            const url = getPortraits(c.outfit ?? c.member)?.sd;
            return url ? h('img', { src: url, alt: '', draggable: 'false' }) : h('span');
          }),
      );
    }
  };

  return {
    el,
    render() {
      sync();
      const ev = game.event();
      if (ev) {
        candy.replaceChildren(currencyIcon(ev), formatNumber(game.eventProgress(ev.id).candy));
        const n = game.eventClaimable;
        badge.hidden = n <= 0;
        badge.textContent = n > 9 ? '9+' : String(n);
      }
    },
    tick() {
      const ev = game.event();
      if (!!ev !== !el.hidden || (ev && ev.id !== evId)) {
        sync();
        this.render();
      }
      if (!ev) return;
      const left = eventTimeLeft(ev, Date.now());
      const text = game.state.events.force && Date.now() < ev.start ? '개발자 옵션으로 미리 열림' : `남은 시간 ${eventRemaining(left)}`;
      if (time.textContent !== text) time.textContent = text;
    },
  };
}

type HubTab = 'gacha' | 'shop' | 'missions' | 'ghost' | 'story';
const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: 'gacha', label: '한정 모집' },
  { id: 'shop', label: '교환소' },
  { id: 'missions', label: '미션' },
  { id: 'ghost', label: '격파' },
  { id: 'story', label: '스토리' },
];

/** 이벤트 화면 (모집·교환소·미션·격파·스토리). 전체 화면으로 덮는다 */
export function openEventHub(game: Game, tab: HubTab = 'gacha', onResultsClosed: (results: PullResult[]) => void = () => {}): void {
  const ev = game.event();
  if (!ev) return;
  document.querySelector('.ev-hub')?.remove();
  let current = tab;
  const wallet = h('span', { class: 'ev-hub__wallet' });
  const time = h('span', { class: 'ev-hub__time' });
  const close = h('button', { class: 'vn__btn vn__btn--close', type: 'button', 'aria-label': '닫기' }, '✕');
  const tabs = h('div', { class: 'ev-hub__tabs', role: 'tablist' });
  const body = h('div', { class: 'ev-hub__body' });
  const root = h(
    'div',
    { class: `ev-hub theme-${ev.theme}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': ev.name },
    h('div', { class: 'ev-hub__top' }, h('div', { class: 'ev-hub__head' }, h('strong', {}, ev.name), time), wallet, close),
    tabs,
    body,
  );
  document.body.append(root);
  bgmWhile(root, 'main');

  const tabBtns = HUB_TABS.map((t) => {
    const b = h('button', { class: 'ev-hub__tab', type: 'button', role: 'tab' }, t.label, h('span', { class: 'badge', hidden: true }));
    onTap(b, () => {
      current = t.id;
      render();
    });
    return { ...t, b };
  });
  tabs.append(...tabBtns.map((t) => t.b));

  const off = game.on((e) => {
    if (e.type === 'changed') render();
  });
  const timer = window.setInterval(() => {
    if (!document.body.contains(root)) return cleanup();
    const live = game.event();
    if (live?.id !== ev.id) {
      cleanup();
      root.remove();
      return;
    }
    time.textContent = `남은 시간 ${eventRemaining(eventTimeLeft(ev, Date.now()))}`;
  }, 1000);
  const cleanup = () => {
    off();
    clearInterval(timer);
  };
  onTap(close, () => {
    cleanup();
    root.remove();
  });

  function render() {
    if (!document.body.contains(root)) return cleanup();
    const p = game.eventProgress(ev!.id);
    wallet.replaceChildren(currencyIcon(ev!, 'md'), h('strong', {}, formatNumber(p.candy)), h('small', {}, ev!.currency.name));
    time.textContent = `남은 시간 ${eventRemaining(eventTimeLeft(ev!, Date.now()))}`;
    for (const t of tabBtns) {
      t.b.classList.toggle('is-active', t.id === current);
      t.b.setAttribute('aria-selected', String(t.id === current));
      const dot = t.b.querySelector('.badge') as HTMLElement;
      const n = t.id === 'missions' ? game.eventClaimable : 0;
      dot.hidden = n <= 0;
      dot.textContent = String(n);
    }
    const scroll = body.scrollTop;
    body.replaceChildren(
      current === 'gacha'
        ? gachaTab(game, ev!, onResultsClosed)
        : current === 'shop'
          ? shopTab(game, ev!)
          : current === 'missions'
            ? missionsTab(game, ev!)
            : current === 'ghost'
              ? ghostTab(game, ev!)
              : storyTab(game, ev!),
    );
    body.scrollTop = scroll;
  }
  render();
}

// ───────────── 한정 모집

function gachaTab(game: Game, ev: EventDef, onResultsClosed: (results: PullResult[]) => void): HTMLElement {
  const p = game.eventProgress(ev.id);
  const uCards = ev.cards.map((id) => getCard(id)).filter((c): c is CardDef => !!c);
  const left = ev.gacha.pity - p.pity;
  const fill = h('div', { class: 'progress__fill progress__fill--u' });
  fill.style.width = `${(p.pity / ev.gacha.pity) * 100}%`;
  const btn = (count: 1 | 10) => {
    const cost = eventPullCost(ev, count);
    const b = h(
      'button',
      { class: 'btn btn--primary gacha__pull ev-pull', type: 'button', disabled: p.candy < cost },
      h('span', { class: 'gacha__pull-label' }, count === 10 ? '10연 모집' : '1회 모집'),
      h('span', { class: 'btn__sub' }, currencyIcon(ev), ` ${cost}`),
      count === 10 ? h('span', { class: 'gacha__pull-note' }, 'SR 이상 1장 확정') : null,
    );
    onTap(b, () => doPull(count));
    return b;
  };
  async function doPull(count: 1 | 10) {
    const results = game.eventPull(count);
    if (!results) return;
    const again = await playPullAnimation(results, {
      canPullAgain: () => !!game.event() && game.eventProgress(ev.id).candy >= eventPullCost(ev, count),
      againLabel: count === 10 ? '10연 한 번 더' : '한 번 더',
    });
    if (again) doPull(count);
    else onResultsClosed(results);
  }
  const rates = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '확률표');
  onTap(rates, () => openEventRates(ev));
  return h(
    'div',
    { class: 'ev-gacha' },
    h(
      'div',
      { class: 'ev-gacha__stage' },
      ...uCards.map((c, i) => {
        const url = getPortraits(c.outfit ?? c.member)?.full;
        return h(
          'figure',
          { class: `ev-gacha__hero ev-gacha__hero--${i}` },
          url ? h('img', { src: url, alt: `${getMember(c.member)?.name} ${c.title}`, draggable: 'false' }) : null,
          h('figcaption', {}, rarityBadge('U'), h('strong', {}, `${c.title} ${getMember(c.member)?.name ?? ''}`), h('small', {}, `“${c.quote}”`)),
        );
      }),
      h('div', { class: 'ev-gacha__title' }, h('small', {}, 'HALLOWEEN LIMITED'), h('strong', {}, ev.gacha.name), h('span', {}, `U ${pct(ev.gacha.rates.U)} · SSR ${pct(ev.gacha.rates.SSR)}`)),
    ),
    h(
      'div',
      { class: 'ev-gacha__panel' },
      h('div', { class: 'gacha__pity' }, h('div', { class: 'gacha__pity-text' }, h('span', {}, 'U 확정까지 ', h('strong', {}, `${left}회`)), h('span', { class: 'gacha__pity-rule' }, `${ev.gacha.pity}회 안에 U 확정 · 이 이벤트에서만 세요 (${p.pity}/${ev.gacha.pity})`)), h('div', { class: 'progress' }, fill)),
      h('div', { class: 'gacha__buttons' }, btn(1), btn(10)),
      h('div', { class: 'ev-gacha__foot' }, h('small', {}, `${ev.currency.name}로만 모집할 수 있어요 · 상시 모집에서는 U가 나오지 않아요`), rates),
    ),
  );
}

/** 이벤트 모집 확률표 */
export function openEventRates(ev: EventDef): void {
  const uCards = ev.cards.map((id) => getCard(id)).filter((c): c is CardDef => !!c);
  const rows: { rarity: Rarity; rate: number; cards: CardDef[] }[] = [
    { rarity: 'U', rate: ev.gacha.rates.U, cards: uCards },
    { rarity: 'SSR', rate: ev.gacha.rates.SSR, cards: cardsOfRarity('SSR') },
    { rarity: 'SR', rate: ev.gacha.rates.SR, cards: cardsOfRarity('SR') },
    { rarity: 'R', rate: ev.gacha.rates.R, cards: cardsOfRarity('R') },
  ];
  const cardRow = (c: CardDef) => h('div', { class: 'rates__card' }, cardFrame(c, { size: 'xs' }), h('div', {}, h('div', { class: 'rates__card-name' }, getMember(c.member)?.name ?? ''), h('div', { class: 'rates__card-title' }, c.title)));
  const body = h(
    'div',
    { class: 'rates' },
    h(
      'table',
      { class: 'rates__table' },
      h('thead', {}, h('tr', {}, h('th', {}, '등급'), h('th', {}, '확률'), h('th', {}, '카드 1장당'))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', {}, rarityBadge(r.rarity)), h('td', {}, pct(r.rate)), h('td', {}, r.cards.length ? pct(r.rate / r.cards.length) : '-')))),
    ),
    h(
      'ul',
      { class: 'rates__rules' },
      h('li', {}, `기간: ${new Date(ev.start).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ~ ${new Date(ev.end).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`),
      h('li', {}, `1회 ${ev.gacha.single}개 · 10연 ${ev.gacha.ten}개 (${ev.currency.name})`),
      h('li', {}, `U 없이 ${ev.gacha.pity - 1}회를 뽑으면 ${ev.gacha.pity}회째는 U 확정이에요. U가 나오면 0으로 돌아가고, 천장 카운트는 이 이벤트 안에서만 쌓여요.`),
      h('li', {}, '10연 모집은 SR 이상 1장이 확정이에요.'),
      h('li', {}, 'U 카드는 이벤트 한정이에요. 상시 모집과 다른 한정 모집에서는 나오지 않아요.'),
      h('li', {}, `이벤트가 끝나면 남은 ${ev.currency.name}는 1개당 전파석 ${ev.currency.stonesPerUnit}개로 바뀌어요.`),
    ),
  );
  for (const r of rows) body.append(h('h3', { class: 'rates__group' }, rarityBadge(r.rarity), ` ${pct(r.rate)}`), h('div', { class: 'rates__cards' }, ...r.cards.map(cardRow)));
  openModal({ title: `확률표 · ${ev.gacha.name}`, body, confirmLabel: '닫기', wide: true });
}

// ───────────── 교환소

function shopTab(game: Game, ev: EventDef): HTMLElement {
  const p = game.eventProgress(ev.id);
  return h(
    'div',
    { class: 'ev-shop' },
    h('p', { class: 'ev-note' }, `U 카드는 한정 모집 ${ev.gacha.pity}회(천장)와 같은 값에 바로 고를 수 있어요.`),
    ...ev.shop.map((item) => {
      const bought = shopBought(game.state, ev, item.id);
      const soldOut = bought >= item.limit;
      const b = h('button', { class: 'btn btn--primary btn--small ev-shop__buy', type: 'button', disabled: soldOut || p.candy < item.price }, soldOut ? '품절' : h('span', {}, currencyIcon(ev), ` ${formatNumber(item.price)}`));
      onTap(b, () => (item.kind === 'card' ? pickShopCard(game, ev, item) : confirmBuy(game, ev, item)));
      return h(
        'div',
        { class: `ev-shop__item ev-shop__item--${item.kind}` },
        h('span', { class: 'ev-shop__icon', 'aria-hidden': 'true' }, item.kind === 'card' ? rarityBadge('U') : item.kind === 'stones' ? h('span', { class: 'gem' }) : item.kind === 'tickets' ? '🎫' : '🔧'),
        h('div', { class: 'ev-shop__text' }, h('strong', {}, item.label), h('small', {}, `교환 ${bought} / ${item.limit}`)),
        b,
      );
    }),
  );
}

function confirmBuy(game: Game, ev: EventDef, item: ShopItem): void {
  openModal({
    title: '교환할까요?',
    body: h('p', { class: 'ev-confirm' }, item.label, ' ← ', currencyChip(ev, item.price, false)),
    cancelLabel: '취소',
    confirmLabel: '교환',
    onConfirm: () => {
      if (game.buyEventItem(item.id)) {
        sfx.coin();
        toast(`🎁 ${item.label} 교환 완료!`);
      }
    },
  });
}

/** U 카드 고르기 → 교환 → 카드 연출 */
function pickShopCard(game: Game, ev: EventDef, item: ShopItem): void {
  const uCards = ev.cards.map((id) => getCard(id)).filter((c): c is CardDef => !!c);
  const body = h(
    'div',
    { class: 'ev-pick' },
    ...uCards.map((c) => {
      const owned = game.state.cards[c.id];
      const b = h('button', { class: 'ev-pick__card', type: 'button' }, cardFrame(c, { size: 'md', limitBreak: owned?.limitBreak }), h('small', {}, owned ? `보유 중 · 돌파 ${owned.limitBreak}` : '미보유'));
      onTap(b, () => {
        document.getElementById('modal')?.remove();
        const r = game.buyEventItem(item.id, c.id);
        if (r?.card) playPullAnimation([{ ...r.card, pickup: true }], { canPullAgain: () => false, againLabel: '' });
      });
      return b;
    }),
  );
  openModal({ title: `U 카드 고르기 · ${formatNumber(item.price)} ${ev.currency.name}`, body, cancelLabel: '취소', confirmLabel: '닫기', confirmGhost: true, wide: true });
}

// ───────────── 미션

function missionsTab(game: Game, ev: EventDef): HTMLElement {
  const p = game.eventProgress(ev.id);
  const row = (scope: 'daily' | 'total', m: EventMission) => {
    const box = scope === 'daily' ? p.daily : p.total;
    const prog = Math.floor(box.progress[m.id] ?? 0);
    const claimed = box.claimed.includes(m.id);
    const done = prog >= m.goal;
    const fill = h('div', { class: 'progress__fill' });
    fill.style.width = `${Math.min(100, (prog / m.goal) * 100)}%`;
    const b = h('button', { class: `btn btn--small ${done && !claimed ? 'btn--primary' : 'btn--ghost'}`, type: 'button', disabled: !done || claimed }, claimed ? '받음 ✓' : done ? '받기' : `${formatNumber(prog)}/${formatNumber(m.goal)}`);
    onTap(b, () => {
      if (game.claimEventMission(scope, m.id)) sfx.coin();
    });
    return h('div', { class: `ev-mission${claimed ? ' is-claimed' : done ? ' is-done' : ''}` }, h('div', { class: 'ev-mission__text' }, h('strong', {}, m.label), rewardChips(ev, m.reward), h('div', { class: 'progress' }, fill)), b);
  };
  return h(
    'div',
    { class: 'ev-missions' },
    h('h3', { class: 'ev-sub' }, '일일 미션', h('small', {}, '매일 0시에 초기화')),
    ...ev.missions.daily.map((m) => row('daily', m)),
    h('h3', { class: 'ev-sub' }, '누적 미션', h('small', {}, '이벤트 기간 동안')),
    ...ev.missions.total.map((m) => row('total', m)),
  );
}

// ───────────── 격파

function ghostTab(game: Game, ev: EventDef): HTMLElement {
  const r = ev.drops.rival;
  const p = game.eventProgress(ev.id);
  const left = Math.max(0, r.dailyCandyWins - (p.ghost.day === dayKey(new Date()) ? p.ghost.candyWins : 0));
  const avatar = h('div', { class: 'rival rival--lg' }, r.emoji);
  avatar.style.setProperty('--rival', r.color);
  const start = h('button', { class: 'btn btn--primary dungeon__start', type: 'button', disabled: game.attackPower <= 0 }, game.attackPower <= 0 ? '카드를 배치하세요' : '대결 시작!');
  onTap(start, () => startEventBattle(game));
  return h(
    'div',
    { class: 'ev-ghost panel' },
    h('div', { class: 'dungeon__stage' }, avatar, h('div', { class: 'dungeon__rival' }, h('div', { class: 'dungeon__badges' }, h('span', { class: 'stage-badge stage-badge--event' }, 'EVENT')), h('div', { class: 'dungeon__name' }, r.name), h('div', { class: 'dungeon__taunt' }, `“${r.taunt}”`))),
    h(
      'ul',
      { class: 'ev-ghost__info' },
      h('li', {}, '승리 보상 ', currencyChip(ev, r.candy, false), ` · 하루 ${r.dailyCandyWins}번 (오늘 ${left}번 남음)`),
      p.ghost.wins === 0 ? h('li', {}, '첫 승리 보너스 ', currencyChip(ev, r.firstWinCandy, false)) : null,
      h('li', {}, `상대 청취자 ${formatNumber(game.ghostHp())} · 지금까지 ${p.ghost.wins}번 격파`),
      h('li', {}, '이길수록 조금씩 강해져요. 탭 응원도 그대로 통해요!'),
    ),
    start,
  );
}

// ───────────── 스토리

function storyTab(game: Game, ev: EventDef): HTMLElement {
  return h(
    'div',
    { class: 'ev-story' },
    h('p', { class: 'ev-note' }, '할로윈 특집 심야 방송을 준비하는 이야기. 본 화는 이벤트가 끝난 뒤에도 부원 › 메인 스토리에서 다시 볼 수 있어요.'),
    h('div', { class: 'episodes' }, ...ev.story.map((ep) => eventEpisodeRow(game, ev, ep))),
  );
}

/** 끝난 이벤트의 남은 재화 → 전파석 안내 */
export function showConversion(conversions: { event: EventDef; candy: number; stones: number }[]): void {
  openModal({
    title: '🎃 이벤트가 끝났어요',
    body: h(
      'div',
      { class: 'ev-convert' },
      ...conversions.map((c) =>
        h('p', {}, `「${c.event.name}」에서 남은 `, currencyChip(c.event, c.candy, false), ` 를 전파석 `, h('strong', {}, formatNumber(c.stones)), '개로 바꿨어요.'),
      ),
      h('small', {}, '이벤트 스토리는 부원 › 메인 스토리에서 계속 다시 볼 수 있어요.'),
    ),
    confirmLabel: '확인',
  });
}
