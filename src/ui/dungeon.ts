import { expectedDamage, isBossStage, rivalFor, rivalHp, stageReward, type RivalDef } from '../core/dungeon';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { getMember } from '../data/members';
import { formatNumber, formatRate } from '../utils/format';
import { celebrate } from './celebrate';
import type { Component } from './component';
import { h, memberSd, onTap } from './dom';

function avatar(rival: RivalDef, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const el = h('div', { class: `rival rival--${size}` }, rival.emoji);
  el.style.setProperty('--rival', rival.color);
  return el;
}

function rewardText(stage: number): string {
  const r = stageReward(stage);
  return [`💎 ${r.stones}`, r.tickets ? `🎫 ${r.tickets}` : '', r.parts ? `부품 ${r.parts}` : ''].filter(Boolean).join(' · ');
}

/** 대결 탭: 라이벌 방송부 스테이지 */
export function createDungeon(game: Game): Component {
  const stageCard = h('div', { class: 'dungeon__stage' });
  const ladder = h('ol', { class: 'dungeon__ladder' });
  const attack = h('strong', {});
  const hpText = h('strong', {});
  const odds = h('span', { class: 'odds' });
  const startBtn = h('button', { class: 'btn btn--primary dungeon__start', type: 'button' }, '대결 시작!');
  onTap(startBtn, () => startBattle(game, game.state.dungeon.stage));

  const el = h(
    'section',
    { class: 'dungeon' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '라이벌 방송부 대결'), h('span', { class: 'panel__sub' }, '청취자를 빼앗아 오자!')),
      stageCard,
      h(
        'div',
        { class: 'dungeon__vs' },
        h('div', { class: 'dungeon__stat' }, h('span', {}, '우리 공격력 (초당 청취자)'), attack),
        h('div', { class: 'dungeon__stat' }, h('span', {}, '라이벌 청취자 (체력)'), hpText),
        h('div', { class: 'dungeon__stat' }, h('span', {}, `${BALANCE.dungeon.timeLimitMs / 1000}초 예상`), odds),
      ),
      startBtn,
      h(
        'p',
        { class: 'dungeon__tip' },
        '공격력은 지금 초당 청취자예요. 카드 강화·장비·송신탑으로 올리고, 레전드 사연 ×3 중에 도전하면 훨씬 유리해요. 대결 중 라이벌을 탭하면 응원 공격!',
      ),
    ),
    h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '대결 기록')), ladder),
  );

  return {
    el,
    render() {
      const stage = game.state.dungeon.stage;
      const rival = rivalFor(stage);
      stageCard.replaceChildren(
        avatar(rival, 'lg'),
        h(
          'div',
          { class: 'dungeon__rival' },
          h('div', { class: 'dungeon__badges' }, h('span', { class: 'stage-badge' }, `STAGE ${stage}`), isBossStage(stage) ? h('span', { class: 'boss-badge' }, 'BOSS') : null),
          h('div', { class: 'dungeon__name' }, rival.name),
          h('div', { class: 'dungeon__taunt' }, `“${rival.taunt}”`),
          h('div', { class: 'dungeon__reward' }, `첫 승리 보상 ${rewardText(stage)}`),
        ),
      );
      const items: HTMLElement[] = [];
      for (let s = Math.max(1, stage - 3); s <= stage + 6; s++) {
        const r = rivalFor(s);
        const state = s < stage ? 'is-cleared' : s === stage ? 'is-current' : 'is-locked';
        items.push(
          h(
            'li',
            { class: `ladder ${state}${isBossStage(s) ? ' is-boss' : ''}` },
            h('span', { class: 'ladder__no' }, String(s)),
            avatar(r),
            h('span', { class: 'ladder__name' }, r.name),
            h('span', { class: 'ladder__hp' }, `청취자 ${formatNumber(rivalHp(s))}`),
            h('span', { class: 'ladder__state' }, s < stage ? '✓ 승리' : s === stage ? '▶ 도전' : '🔒'),
          ),
        );
      }
      ladder.replaceChildren(...items);
    },
    tick() {
      const stage = game.state.dungeon.stage;
      const hp = rivalHp(stage);
      const atk = game.attackPower;
      attack.textContent = formatRate(atk);
      hpText.textContent = formatNumber(hp);
      const ratio = expectedDamage(atk) / hp;
      const label = atk <= 0 ? '카드를 배치하세요' : ratio >= 1.3 ? `여유 (${Math.round(ratio * 100)}%)` : ratio >= 0.8 ? `아슬아슬 (${Math.round(ratio * 100)}%)` : `부족 (${Math.round(ratio * 100)}%)`;
      if (odds.textContent !== label) {
        odds.textContent = label;
        odds.className = `odds ${atk <= 0 ? '' : ratio >= 1.3 ? 'is-good' : ratio >= 0.8 ? 'is-close' : 'is-bad'}`;
      }
      if (startBtn.disabled !== atk <= 0) startBtn.disabled = atk <= 0;
    },
  };
}

/** 대결 연출: 30초 동안 라이벌 청취자를 빼앗는다 */
function startBattle(game: Game, stage: number): void {
  if (document.querySelector('.battle')) return;
  const rival = rivalFor(stage);
  const maxHp = rivalHp(stage);
  const limit = BALANCE.dungeon.timeLimitMs / 1000;

  const hpFill = h('div', { class: 'battle__hp-fill' });
  const hpText = h('div', { class: 'battle__hp-text' });
  const timeFill = h('div', { class: 'battle__time-fill' });
  const timeText = h('span', {});
  const atkText = h('strong', {});
  const floats = h('div', { class: 'battle__floats' });
  const target = h('button', { class: 'battle__target', type: 'button', 'aria-label': `${rival.name} 응원 공격` }, avatar(rival, 'lg'));
  const team = h(
    'div',
    { class: 'battle__team' },
    ...Object.values(game.state.assignments)
      .map((id) => (id ? getCard(id) : undefined))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => h('div', { class: 'battle__member' }, memberSd(getMember(c.member)!, c.outfit))),
  );
  const result = h('div', { class: 'battle__result', hidden: true });
  const root = h(
    'div',
    { class: 'battle', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${rival.name}과 대결` },
    h(
      'div',
      { class: 'battle__top' },
      h('div', { class: 'battle__title' }, h('span', { class: 'stage-badge' }, `STAGE ${stage}`), isBossStage(stage) ? h('span', { class: 'boss-badge' }, 'BOSS') : null, ` ${rival.name}`),
      h('div', { class: 'battle__time' }, h('div', { class: 'battle__time-bar' }, timeFill), timeText),
    ),
    h(
      'div',
      { class: 'battle__arena' },
      h('div', { class: 'battle__taunt' }, `“${rival.taunt}”`),
      target,
      h('div', { class: 'battle__hp' }, hpFill),
      hpText,
      floats,
      h('div', { class: 'battle__hint' }, '라이벌을 탭해서 응원 공격!'),
    ),
    h('div', { class: 'battle__bottom' }, team, h('div', { class: 'battle__atk' }, '우리 공격력 ', atkText, ' /초')),
    result,
  );
  root.style.setProperty('--rival', rival.color);
  document.body.append(root);

  let hp = maxHp;
  let elapsed = 0;
  let pending = 0;
  let floatClock = 0;
  let last = performance.now();
  let over = false;

  const float = (text: string, cls = '') => {
    const f = h('span', { class: `battle__float ${cls}` }, text);
    f.style.left = `${40 + Math.random() * 20}%`;
    floats.append(f);
    setTimeout(() => f.remove(), 900);
  };

  onTap(target, () => {
    if (over) return;
    const dmg = game.attackPower * BALANCE.dungeon.tapDamage;
    hp -= dmg;
    float(`응원 -${formatNumber(dmg)}`, 'is-tap');
    target.classList.remove('is-hit');
    void target.offsetWidth;
    target.classList.add('is-hit');
  });

  const frame = (t: number) => {
    if (over) return;
    // 화면을 떠났다 돌아와도 한 번에 시간이 흐르지 않게 프레임 간격을 제한
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    elapsed += dt;
    const dmg = game.attackPower * dt;
    hp -= dmg;
    pending += dmg;
    floatClock += dt;
    if (floatClock >= 0.4 && pending > 0) {
      float(`-${formatNumber(pending)}`);
      pending = 0;
      floatClock = 0;
    }
    hp = Math.max(0, hp);
    hpFill.style.width = `${(hp / maxHp) * 100}%`;
    hpText.textContent = `남은 청취자 ${formatNumber(hp)} / ${formatNumber(maxHp)}`;
    const left = Math.max(0, limit - elapsed);
    timeFill.style.width = `${(left / limit) * 100}%`;
    timeText.textContent = `${Math.ceil(left)}초`;
    atkText.textContent = formatRate(game.attackPower);
    if (hp <= 0) return finish(true);
    if (left <= 0) return finish(false);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  function finish(win: boolean) {
    over = true;
    root.classList.add(win ? 'is-win' : 'is-lose');
    const closeBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, '닫기');
    onTap(closeBtn, () => root.remove());
    if (win) {
      const reward = game.winStage(stage);
      result.replaceChildren(
        h('div', { class: 'battle__verdict' }, '승리!'),
        h('p', {}, `“${rival.defeat}”`),
        ...(reward ? [h('div', { class: 'battle__reward' }, `💎 ${reward.stones}`, reward.tickets ? ` · 🎫 ${reward.tickets}` : '', reward.parts ? ` · 부품 ${reward.parts}` : '')] : []),
        h('div', { class: 'battle__actions' }, closeBtn, nextButton()),
      );
      celebrate(`🏆 ${rival.name} 격파!`, `STAGE ${stage} 클리어`);
    } else {
      const retry = h('button', { class: 'btn btn--primary', type: 'button' }, '다시 도전');
      onTap(retry, () => {
        root.remove();
        startBattle(game, stage);
      });
      result.replaceChildren(
        h('div', { class: 'battle__verdict is-lose' }, '시간 초과…'),
        h('p', {}, `청취자 ${formatNumber(hp)}명이 아직 ${rival.name} 쪽에 남았어요.`),
        h('p', { class: 'battle__advice' }, '카드 강화·장비 교체·송신탑 레벨업으로 공격력을 올리거나, 레전드 사연 ×3 중에 다시 도전해 보세요.'),
        h('div', { class: 'battle__actions' }, closeBtn, retry),
      );
    }
    result.hidden = false;
  }

  function nextButton(): HTMLElement {
    const next = h('button', { class: 'btn btn--primary', type: 'button' }, `다음 스테이지 (${stage + 1})`);
    onTap(next, () => {
      root.remove();
      startBattle(game, game.state.dungeon.stage);
    });
    return next;
  }
}
