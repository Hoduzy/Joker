import type { Game } from '../core/game';
import { towerMultiplier } from '../core/economy';
import { unreadTotal } from '../core/phone';
import { nextUnlock } from '../core/unlocks';
import { milestoneReward, milestoneThreshold } from '../core/rewards';
import { formatNumber, formatRate } from '../utils/format';
import type { Component } from './component';
import { h, onTap } from './dom';
import { popNumber } from './fx';
import { sfx } from './sfx';
import { currencyIcon } from './currency';

const BOOST_LABEL = { legend: '📮 레전드 사연', accident: '📡 방송사고' } as const;

export interface HeaderActions {
  phone(): void;
  missions(): void;
  settings(): void;
  /** 이벤트 화면 (상단 사탕을 눌렀을 때) */
  event(): void;
}

export function createHeader(game: Game, actions: HeaderActions): Component {
  // 문자·미션·설정 아이콘 (배지 = 읽지 않은 문자 / 받을 수 있는 미션 보상)
  const iconBtn = (emoji: string, label: string, onClick: () => void) => {
    const badge = h('span', { class: 'badge icon-btn__badge', hidden: true });
    const btn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label }, h('span', { 'aria-hidden': 'true' }, emoji), badge);
    onTap(btn, onClick);
    return { btn, badge };
  };
  const phone = iconBtn('📱', '문자', actions.phone);
  const missions = iconBtn('📋', '오늘의 미션', actions.missions);
  const settings = iconBtn('⚙️', '설정', actions.settings);
  const setBadge = (b: HTMLElement, n: number) => {
    const text = n > 9 ? '9+' : String(n);
    if (b.hidden !== n <= 0) b.hidden = n <= 0;
    if (b.textContent !== text) b.textContent = text;
  };

  const count = h('span', { class: 'hud__count' }, '0');
  const rate = h('span', { class: 'hud__rate' }, '');
  const stones = h('span', { class: 'hud__count hud__count--stones' }, '0');
  // 시즌 이벤트 한정 재화 (이벤트 중에만 보인다. 누르면 이벤트 화면)
  const candy = h('span', { class: 'hud__count hud__count--candy' }, '0');
  const candyLabel = h('span', { class: 'hud__label' });
  const candyIcon = h('span', { class: 'hud__gem' });
  const candyStat = h('button', { class: 'hud__stat hud__stat--candy', type: 'button', hidden: true }, candyLabel, h('span', { class: 'hud__gem' }, candyIcon, candy));
  onTap(candyStat, () => actions.event());
  let candyEv = '';
  const lamp = h('span', { class: 'onair' }, 'ON AIR');
  const boosts = h('div', { class: 'hud__boosts' });

  // 송신탑: 스크롤 없이 언제든 누를 수 있게 헤더에 둔다
  const towerFill = h('span', { class: 'tower-btn__fill' });
  const towerLevel = h('strong', {});
  const towerSub = h('small', {});
  const towerBtn = h(
    'button',
    { class: 'tower-btn', type: 'button', 'aria-label': '송신탑 레벨업' },
    towerFill,
    h('span', { class: 'tower-btn__icon', 'aria-hidden': 'true' }, '📡'),
    h('span', { class: 'tower-btn__text' }, towerLevel, towerSub),
  );
  towerBtn.setAttribute('data-sfx', 'none');
  onTap(towerBtn, () => {
    if (game.upgradeTower()) {
      sfx.levelUp();
      popNumber(towerBtn, `Lv.${game.state.towerLevel}!`, 'fx-pop--up');
    } else {
      sfx.enhanceFail();
      towerBtn.classList.remove('is-denied');
      void towerBtn.offsetWidth;
      towerBtn.classList.add('is-denied');
    }
  });

  // 다음 목표 (누적 청취자 마일스톤)
  const goalText = h('span', { class: 'goal__text' });
  const goalFill = h('div', { class: 'goal__fill' });
  const goalReward = h('span', { class: 'goal__reward' });
  // 다음에 열릴 자리·기능
  const unlockChip = h('span', { class: 'goal__unlock' });
  const goal = h(
    'div',
    { class: 'goal' },
    h('span', { class: 'goal__label' }, '다음 목표'),
    goalText,
    h('div', { class: 'goal__bar' }, goalFill),
    goalReward,
    unlockChip,
    boosts,
  );

  const el = h(
    'header',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud__top' },
      h('div', { class: 'hud__brand' }, lamp, h('h1', { class: 'hud__title' }, '심야방송부')),
      towerBtn,
      h(
        'div',
        { class: 'hud__stats' },
        h('div', { class: 'hud__stat' }, h('span', { class: 'hud__label' }, '청취자'), count, rate),
        h('div', { class: 'hud__stat' }, h('span', { class: 'hud__label' }, '전파석'), h('span', { class: 'hud__gem' }, h('span', { class: 'gem', 'aria-hidden': 'true' }), stones)),
        candyStat,
      ),
    ),
    goal,
  );
  el.querySelector('.hud__top')!.append(h('div', { class: 'hud__icons' }, phone.btn, missions.btn, settings.btn));

  let lastBoostKey = '';
  let lastPop = 0;
  return {
    el,
    render() {
      lamp.classList.toggle('is-live', game.baseRate > 0);
      const lv = game.state.towerLevel;
      towerLevel.textContent = `송신탑 Lv.${lv}`;
      towerBtn.title = `송출 배율 ×${towerMultiplier(lv).toFixed(2)} → ×${towerMultiplier(lv + 1).toFixed(2)}`;
    },
    tick() {
      const s = game.state;
      count.textContent = formatNumber(s.listeners);
      // 1.5초마다 모인 청취자 수가 숫자 위로 떠오른다
      const t = performance.now();
      if (t - lastPop > 1500 && game.rate > 0 && document.visibilityState === 'visible') {
        lastPop = t;
        if (!document.querySelector('.vn, .battle, .pull, .phone')) popNumber(count, `+${formatNumber(game.rate * 1.5)}`, 'fx-pop--small');
      }
      rate.textContent = `+${formatRate(game.rate)} /초`;
      stones.textContent = formatNumber(s.stones);
      const ev = game.event();
      if (candyStat.hidden !== !ev) candyStat.hidden = !ev;
      if (ev) {
        if (candyEv !== ev.id) {
          candyEv = ev.id;
          candyLabel.textContent = ev.currency.name;
          candyIcon.replaceChildren(currencyIcon(ev));
          candyStat.setAttribute('aria-label', `${ev.currency.name} · 이벤트 열기`);
        }
        const text = formatNumber(s.events.progress[ev.id]?.candy ?? 0);
        if (candy.textContent !== text) candy.textContent = text;
      }
      const cost = game.towerCost;
      const can = s.listeners >= cost;
      towerSub.textContent = `${can ? '레벨업!' : '레벨업'} · ${formatNumber(cost)}`;
      towerFill.style.width = `${Math.min(100, (s.listeners / cost) * 100)}%`;
      towerBtn.classList.toggle('is-ready', can);

      setBadge(phone.badge, unreadTotal(s));
      setBadge(missions.badge, game.missionClaimable);
      missions.btn.classList.toggle('is-locked', !game.isUnlocked('missions'));
      const upcoming = nextUnlock(s);
      const unlockText = upcoming ? `🔒 ${upcoming.label} · ${formatNumber(upcoming.at)}` : '';
      if (unlockChip.textContent !== unlockText) {
        unlockChip.textContent = unlockText;
        unlockChip.hidden = !upcoming;
        unlockChip.title = upcoming ? `누적 청취자 ${formatNumber(upcoming.at)}명이 되면 ${upcoming.label}이(가) 열려요` : '';
      }
      phone.btn.classList.toggle('is-ringing', unreadTotal(s) > 0);

      const step = s.milestonesReached;
      const next = milestoneThreshold(step);
      const prev = step > 0 ? milestoneThreshold(step - 1) : 0;
      const ratio = Math.min(1, Math.max(0, (s.totalListeners - prev) / (next - prev)));
      goalText.textContent = `누적 청취자 ${formatNumber(s.totalListeners)} / ${formatNumber(next)}`;
      goalFill.style.width = `${ratio * 100}%`;
      goalReward.textContent = `💎 ${milestoneReward(step)}`;

      // 배수 칩: 남은 시간이 초 단위로 바뀔 때만 다시 그린다
      const now = Date.now();
      const active = game.activeBoosts(now);
      const key = active.map((b) => `${b.kind}${Math.ceil((b.until - now) / 1000)}`).join('|');
      if (key !== lastBoostKey) {
        lastBoostKey = key;
        boosts.replaceChildren(
          ...active.map((b) =>
            h('span', { class: `boost boost--${b.kind}` }, `${BOOST_LABEL[b.kind]} ×${b.multiplier} · ${Math.ceil((b.until - now) / 1000)}초`),
          ),
        );
        rate.classList.toggle('is-boosted', game.multiplier(now) > 1);
        rate.classList.toggle('is-nerfed', game.multiplier(now) < 1);
      }
    },
  };
}
