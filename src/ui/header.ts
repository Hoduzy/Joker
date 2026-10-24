import type { Game } from '../core/game';
import { towerMultiplier } from '../core/economy';
import { milestoneReward, milestoneThreshold } from '../core/rewards';
import { formatNumber, formatRate } from '../utils/format';
import type { Component } from './component';
import { h, onTap } from './dom';

const BOOST_LABEL = { legend: '📮 레전드 사연', accident: '📡 방송사고' } as const;

export function createHeader(game: Game): Component {
  const count = h('span', { class: 'hud__count' }, '0');
  const rate = h('span', { class: 'hud__rate' }, '');
  const stones = h('span', { class: 'hud__count hud__count--stones' }, '0');
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
  onTap(towerBtn, () => {
    if (!game.upgradeTower()) {
      towerBtn.classList.remove('is-denied');
      void towerBtn.offsetWidth;
      towerBtn.classList.add('is-denied');
    }
  });

  // 다음 목표 (누적 청취자 마일스톤)
  const goalText = h('span', { class: 'goal__text' });
  const goalFill = h('div', { class: 'goal__fill' });
  const goalReward = h('span', { class: 'goal__reward' });
  const goal = h(
    'div',
    { class: 'goal' },
    h('span', { class: 'goal__label' }, '다음 목표'),
    goalText,
    h('div', { class: 'goal__bar' }, goalFill),
    goalReward,
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
      ),
    ),
    goal,
  );

  let lastBoostKey = '';
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
      rate.textContent = `+${formatRate(game.rate)} /초`;
      stones.textContent = formatNumber(s.stones);
      const cost = game.towerCost;
      const can = s.listeners >= cost;
      towerSub.textContent = `${can ? '레벨업!' : '레벨업'} · ${formatNumber(cost)}`;
      towerFill.style.width = `${Math.min(100, (s.listeners / cost) * 100)}%`;
      towerBtn.classList.toggle('is-ready', can);

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
