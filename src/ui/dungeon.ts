import { battleScore, expectedDamage, isBossStage, rivalFor, rivalHp, stageReward, type RivalDef, type StageReward } from '../core/dungeon';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { getMember } from '../data/members';
import { formatNumber, formatRate } from '../utils/format';
import { celebrate } from './celebrate';
import type { Component } from './component';
import { h, memberSd, onTap } from './dom';
import { popNumber } from './fx';
import { sfx } from './sfx';

function avatar(rival: RivalDef, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const el = h('div', { class: `rival rival--${size}` }, rival.emoji);
  el.style.setProperty('--rival', rival.color);
  return el;
}

function rewardText(stage: number): string {
  return rewardChips(stageReward(stage));
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
        h('div', { class: 'dungeon__stat' }, h('span', {}, '예상 (탭 없이)'), odds),
      ),
      startBtn,
      h(
        'p',
        { class: 'dungeon__tip' },
        '4초 줄다리기! 공격력(초당 청취자) × 30초만큼 끌어오고, 화면을 탭할 때마다 0.5초분 더 당겨요. 카드 강화·장비·송신탑·호감도로 공격력을 올리고, 레전드 사연 ×3 중에 도전하면 훨씬 유리해요. 이기면 💎·🎫·🔧!',
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

/**
 * 대결 연출: 4초 줄다리기. 양쪽 방송부가 청취자를 끌어당긴다.
 * 결과는 battleScore(공격력, 탭 수) >= 라이벌 청취자. 화면을 탭하면 응원(당기기)
 */
function startBattle(game: Game, stage: number): void {
  if (document.querySelector('.battle')) return;
  const rival = rivalFor(stage);
  const hp = rivalHp(stage);
  const showMs = BALANCE.dungeon.showMs;
  const atk = game.attackPower;

  const marker = h('div', { class: 'tug__knot' }, '📻');
  const ourFill = h('div', { class: 'tug__fill tug__fill--us' });
  const rivalFill = h('div', { class: 'tug__fill tug__fill--them' });
  const ourCount = h('strong', {}, '0');
  const rivalCount = h('strong', {}, '0');
  const timeFill = h('div', { class: 'battle__time-fill' });
  const tapCount = h('span', { class: 'tug__taps' });
  const flyers = h('div', { class: 'tug__flyers' });
  const team = h(
    'div',
    { class: 'tug__side tug__side--us' },
    ...Object.values(game.state.assignments)
      .map((id) => (id ? getCard(id) : undefined))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => h('div', { class: 'battle__member' }, memberSd(getMember(c.member)!, c.outfit))),
  );
  const them = h('div', { class: 'tug__side tug__side--them' }, avatar(rival, 'lg'));
  const arena = h(
    'button',
    { class: 'tug', type: 'button', 'aria-label': '탭해서 응원', 'data-sfx': 'none' },
    h('div', { class: 'tug__counts' }, h('span', {}, '우리 ', ourCount), h('span', {}, rivalCount, ` ${rival.name}`)),
    h('div', { class: 'tug__field' }, team, h('div', { class: 'tug__rope' }, ourFill, rivalFill, h('i', { class: 'tug__center' }), marker), them),
    flyers,
    h('div', { class: 'battle__hint' }, '마구 탭해서 응원! ', tapCount),
  );
  const result = h('div', { class: 'battle__result', hidden: true });
  const root = h(
    'div',
    { class: 'battle battle--tug', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${rival.name}과 대결` },
    h(
      'div',
      { class: 'battle__top' },
      h('div', { class: 'battle__title' }, h('span', { class: 'stage-badge' }, `STAGE ${stage}`), isBossStage(stage) ? h('span', { class: 'boss-badge' }, 'BOSS') : null, ` ${rival.name}`),
      h('div', { class: 'battle__time' }, h('div', { class: 'battle__time-bar' }, timeFill)),
    ),
    h('div', { class: 'battle__taunt' }, `“${rival.taunt}”`),
    arena,
    h('div', { class: 'battle__bottom' }, h('div', { class: 'battle__atk' }, '우리 공격력 ', h('strong', {}, formatRate(atk)), ' /초 · 라이벌 청취자 ', h('strong', {}, formatNumber(hp)))),
    result,
  );
  root.style.setProperty('--rival', rival.color);
  document.body.append(root);

  let taps = 0;
  let over = false;
  let start = 0;
  let lastFly = 0;

  /** 청취자 아이콘이 한쪽에서 다른 쪽으로 날아간다 */
  const fly = (toUs: boolean) => {
    const f = h('span', { class: `tug__flyer ${toUs ? 'is-us' : 'is-them'}` }, '♪');
    f.style.top = `${30 + Math.random() * 40}%`;
    flyers.append(f);
    setTimeout(() => f.remove(), 700);
  };

  onTap(arena, () => {
    if (over) return;
    taps += 1;
    tapCount.textContent = `응원 ×${taps}`;
    sfx.pull();
    popNumber({ x: arena.getBoundingClientRect().left + arena.clientWidth * (0.25 + Math.random() * 0.2), y: arena.getBoundingClientRect().top + arena.clientHeight * 0.45 }, `+${formatNumber(atk * BALANCE.dungeon.tapSeconds)}`, 'fx-pop--tap');
    team.classList.remove('is-pull');
    void team.offsetWidth;
    team.classList.add('is-pull');
    fly(true);
  });

  const frame = (t: number) => {
    if (over) return;
    if (!start) start = t;
    const f = Math.min(1, (t - start) / showMs);
    // 우리 쪽: 시간 비례 + 탭, 라이벌 쪽: 체력을 같은 속도로. 줄은 차이만큼 움직인다
    // 탭 응원분은 바로 반영된다
    const ours = battleScore(atk, 0) * f + battleScore(atk, taps) - battleScore(atk, 0);
    const theirs = hp * f;
    const wobble = f < 1 ? Math.sin(t / 90) * 0.03 : 0;
    const diff = Math.max(-1, Math.min(1, (ours - theirs) / Math.max(hp * 0.35, 1) + wobble));
    marker.style.left = `${50 + diff * 42}%`;
    ourFill.style.width = `${Math.max(0, 50 + diff * 42)}%`;
    rivalFill.style.width = `${Math.max(0, 50 - diff * 42)}%`;
    ourCount.textContent = formatNumber(ours);
    rivalCount.textContent = formatNumber(theirs);
    timeFill.style.width = `${(1 - f) * 100}%`;
    if (t - lastFly > 160) {
      lastFly = t;
      fly(Math.random() < 0.5 + diff * 0.4);
      if (Math.random() < 0.35) sfx.pull();
    }
    if (f >= 1) return finish(battleScore(atk, taps) >= hp, ours);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function finish(win: boolean, ours: number) {
    over = true;
    game.recordBattle();
    root.classList.add(win ? 'is-win' : 'is-lose');
    const closeBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, '닫기');
    onTap(closeBtn, () => root.remove());
    if (win) {
      sfx.victory();
      const reward = game.winStage(stage);
      result.replaceChildren(
        h('div', { class: 'battle__verdict' }, '승리!'),
        h('p', {}, `“${rival.defeat}”`),
        ...(reward
          ? [h('div', { class: 'battle__reward' }, rewardChips(reward)), h('p', { class: 'battle__advice' }, '🎫 티켓은 협찬 택배, 🔧 키트는 카드 강화, 💎 전파석은 뽑기에 써요')]
          : []),
        h('div', { class: 'battle__actions' }, closeBtn, nextButton()),
      );
      celebrate(`🏆 ${rival.name} 격파!`, `STAGE ${stage} 클리어`);
    } else {
      sfx.defeat();
      const retry = h('button', { class: 'btn btn--primary', type: 'button' }, '다시 도전');
      onTap(retry, () => {
        root.remove();
        startBattle(game, stage);
      });
      result.replaceChildren(
        h('div', { class: 'battle__verdict is-lose' }, '아쉽다…'),
        h('p', {}, `${formatNumber(hp - ours)}명 차이로 ${rival.name}에게 밀렸어요.`),
        h('p', { class: 'battle__advice' }, '카드 강화·장비 교체·송신탑·호감도로 공격력을 올리거나, 레전드 사연 ×3 중에 다시 도전해 보세요. 탭 응원도 힘이 돼요!'),
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

function rewardChips(r: StageReward): string {
  return [`💎 ${r.stones}`, r.tickets ? `🎫 ${r.tickets}` : '', r.kits ? `🔧 ${r.kits}` : '', r.parts ? `⚙️ 부품 ${r.parts}` : ''].filter(Boolean).join(' · ');
}
