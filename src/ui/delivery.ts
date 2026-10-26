import {
  boxRates,
  equipBonuses,
  equipmentPower,
  itemPart,
  maxBoxLevel,
  msToNextTicket,
  shouldAutoStop,
  type EquipItem,
} from '../core/equipment';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { GRADES, PARTS, SUB_OPTIONS, getGrade, gradeRank } from '../data/equipment';
import { STAT_KEYS, STAT_LABELS } from '../data/stats';
import { formatNumber } from '../utils/format';
import type { Component } from './component';
import { h, onTap, patchChildren } from './dom';
import { openCompare } from './equipCompare';
import { equipCard, equipTile, fmtPct, gradeColor } from './equipView';
import { openModal } from './modal';
import { lightPillar, popNumber } from './fx';
import { sfx } from './sfx';
import { gemIcon, toast } from './toast';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 방송실 가운데: 협찬 택배 상자와 공용 장비 6칸 */
export function createDelivery(game: Game): Component {
  // ── 상자
  const pop = h('div', { class: 'box__pop' });
  const box = h(
    'button',
    { class: 'box', type: 'button', 'aria-label': '협찬 택배 열기' },
    h('div', { class: 'box__shadow' }),
    h('div', { class: 'box__body' }, h('div', { class: 'box__tape' }), h('div', { class: 'box__label' }, h('strong', {}, '협찬'), h('span', {}, '심야방송부 귀하'))),
    h('div', { class: 'box__lid' }, h('div', { class: 'box__tape' })),
    pop,
  );
  const boxHint = h('div', { class: 'box__hint' });
  const rays = h('div', { class: 'box__rays' });
  const stage = h('div', { class: 'delivery__stage' }, rays, box, boxHint);

  // ── 장비 칸
  const slotEls = new Map<string, HTMLButtonElement>();
  const gearCol = (ids: string[]) =>
    h(
      'div',
      { class: 'delivery__gear' },
      ...ids.map((id) => {
        const btn = h('button', { class: 'gear', type: 'button' });
        onTap(btn, () => openEquipped(id));
        slotEls.set(id, btn);
        return btn;
      }),
    );
  const half = Math.ceil(PARTS.length / 2);
  const left = gearCol(PARTS.slice(0, half).map((p) => p.id));
  const right = gearCol(PARTS.slice(half).map((p) => p.id));

  // ── 하단 컨트롤
  const level = h('span', { class: 'delivery__level' });
  const power = h('span', { class: 'delivery__power' });
  const ratesBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '확률표');
  onTap(ratesBtn, () => openBoxRates(game));

  const tickets = h('strong', { class: 'delivery__tickets' });
  const ticketTimer = h('span', { class: 'delivery__timer' });
  const buy1 = h('button', { class: 'btn btn--ghost btn--small', type: 'button' });
  const buy10 = h('button', { class: 'btn btn--ghost btn--small', type: 'button' });
  onTap(buy1, () => game.buyTickets(1) && toast('택배 티켓 1장 구매'));
  onTap(buy10, () => game.buyTickets(10) && toast('택배 티켓 10장 구매'));

  const partsText = h('span', {});
  const partsFill = h('div', { class: 'progress__fill progress__fill--parts' });
  const levelUp = h('button', { class: 'btn btn--primary btn--small', type: 'button' }, '레벨업');
  onTap(levelUp, () => game.levelUpBox() && sfx.levelUp());
  // 남는 부품 → 카드 강화용 튜닝 키트
  const kitBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, `🔧 키트 교환`);
  onTap(kitBtn, () => openKitExchange(game));

  const autoBtn = h('button', { class: 'btn btn--auto', type: 'button' });
  const autoStatus = h('span', { class: 'delivery__auto-status' });
  onTap(autoBtn, () => {
    if (!game.autoUnlocked) {
      toast(`자동 개봉은 택배 Lv.${BALANCE.box.autoUnlockLevel}에서 열려요`);
      return;
    }
    if (autoRunning) stopAuto();
    else openAutoSettings(game, () => runAuto());
  });

  const bonusLine = h('div', { class: 'delivery__bonus' });

  const el = h(
    'section',
    { class: 'panel delivery' },
    h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '협찬 택배 ', level), h('div', { class: 'delivery__head-right' }, power, ratesBtn)),
    h('div', { class: 'delivery__main' }, left, stage, right),
    h(
      'div',
      { class: 'delivery__controls' },
      h('div', { class: 'delivery__row' }, h('span', { class: 'ticket', 'aria-hidden': 'true' }, '🎫'), tickets, ticketTimer, h('span', { class: 'delivery__spacer' }), buy1, buy10),
      h('div', { class: 'delivery__row' }, h('span', { class: 'delivery__parts-label' }, '부품'), h('div', { class: 'progress delivery__parts' }, partsFill), partsText, levelUp, kitBtn),
      h('div', { class: 'delivery__row' }, autoBtn, autoStatus),
      bonusLine,
    ),
  );

  // ── 열기
  let busy = false;
  let autoRunning = false;

  /** 상자가 열리고 장비가 튀어나오는 연출 */
  async function animateOpen(item: EquipItem, fast: boolean) {
    const rank = gradeRank(item.grade);
    if (!fast) sfx.boxOpen();
    pop.replaceChildren(equipTile(item, itemPart(item), 'md'));
    pop.style.setProperty('--grade', gradeColor(item.grade));
    box.classList.remove('is-opening', 'is-rare', 'is-epic');
    void box.offsetWidth;
    box.classList.add('is-opening');
    if (rank >= 3) box.classList.add('is-epic');
    else if (rank >= 2) box.classList.add('is-rare');
    if (rank >= 3) {
      rays.style.setProperty('--grade', gradeColor(item.grade));
      rays.classList.remove('is-on');
      void rays.offsetWidth;
      rays.classList.add('is-on');
    }
    await sleep(fast ? 120 : 280);
    // 등급 소리는 상자가 열리는 순간. 자동 개봉 중에는 영웅 이상만
    if (!fast || rank >= 3) sfx.grade(rank);
    if (rank >= 4) lightPillar(gradeColor(item.grade), rank >= 5);
    await sleep(fast ? 140 : rank >= 4 ? 820 : 470);
  }

  function resetBox() {
    box.classList.remove('is-opening', 'is-rare', 'is-epic');
  }

  async function openOnce() {
    if (busy) return;
    const pending = game.state.box.pending;
    if (pending) {
      openCompare(game, pending, resetBox);
      return;
    }
    const item = game.openBox();
    if (!item) {
      box.classList.remove('is-shake');
      void box.offsetWidth;
      box.classList.add('is-shake');
      toast('택배 티켓이 없어요. 1분마다 1장씩 충전돼요');
      return;
    }
    busy = true;
    await animateOpen(item, false);
    busy = false;
    openCompare(game, item, resetBox);
  }
  onTap(box, () => {
    if (autoRunning) return;
    openOnce();
  });

  async function runAuto() {
    if (autoRunning || busy) return;
    if (game.state.box.pending) {
      openCompare(game, game.state.box.pending, resetBox);
      return;
    }
    autoRunning = true;
    el.classList.add('is-auto');
    const tally = { count: 0, stones: 0, parts: 0 };
    renderAuto(tally);
    while (autoRunning) {
      const item = game.openBox();
      if (!item) {
        toast('택배 티켓을 다 썼어요');
        break;
      }
      busy = true;
      await animateOpen(item, true);
      busy = false;
      if (shouldAutoStop(item, game.state.equipment[itemPart(item)], game.state.box.auto)) {
        stopAuto();
        openCompare(game, item, resetBox);
        break;
      }
      const r = game.salvagePending();
      tally.count++;
      tally.stones += r.stones;
      tally.parts += r.parts;
      renderAuto(tally);
      resetBox();
      await sleep(BALANCE.box.autoIntervalMs);
    }
    stopAuto();
    if (tally.count > 0) toast(`자동 분해 ${tally.count}개 · 전파석 +${tally.stones} · 부품 +${tally.parts}`, gemIcon());
  }

  function stopAuto() {
    autoRunning = false;
    el.classList.remove('is-auto');
    renderAutoButton();
  }

  function renderAuto(t: { count: number; stones: number; parts: number }) {
    renderAutoButton();
    autoStatus.textContent = `자동 분해 ${t.count}개 · 전파석 +${t.stones} · 부품 +${t.parts}`;
  }

  function renderAutoButton() {
    if (!game.autoUnlocked) {
      autoBtn.textContent = `🔒 자동 개봉 (Lv.${BALANCE.box.autoUnlockLevel} 해금)`;
      autoBtn.classList.add('is-locked');
      autoStatus.textContent = '';
      return;
    }
    autoBtn.classList.remove('is-locked');
    autoBtn.textContent = autoRunning ? '■ 자동 개봉 중지' : '▶ 자동 개봉';
    autoBtn.classList.toggle('is-running', autoRunning);
    if (!autoRunning) autoStatus.textContent = autoSummary(game);
  }

  // 화면을 떠나면 자동 개봉을 멈춘다 (타이머가 느려져 연출이 꼬이지 않게)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && autoRunning) stopAuto();
  });

  function openEquipped(partId: string) {
    const item = game.state.equipment[partId];
    openModal({ title: '장착 장비', body: equipCard(item, partId), confirmLabel: '닫기' });
  }

  return {
    el,
    render() {
      const s = game.state;
      level.textContent = `Lv.${s.box.level}`;
      power.textContent = `장비 전투력 ${equipmentPower(s).toLocaleString('ko-KR')}`;
      for (const p of PARTS) {
        const btn = slotEls.get(p.id)!;
        const item = s.equipment[p.id];
        patchChildren(btn, [equipTile(item, p.id, 'sm'), h('span', { class: 'gear__name' }, p.name)]);
        btn.classList.toggle('is-empty', !item);
      }
      const cost = game.boxLevelCost;
      if (cost === null) {
        partsText.textContent = `${s.box.parts} · 최대 레벨`;
        partsFill.style.width = '100%';
        levelUp.hidden = true;
      } else {
        partsText.textContent = `${s.box.parts} / ${cost}`;
        partsFill.style.width = `${Math.min(100, (s.box.parts / cost) * 100)}%`;
        levelUp.hidden = false;
      }
      patchChildren(bonusLine, bonusChips(game));
      renderAutoButton();
    },
    tick() {
      const s = game.state;
      tickets.textContent = `${s.box.tickets} / ${BALANCE.tickets.max}`;
      const next = msToNextTicket(s, Date.now());
      ticketTimer.textContent = next > 0 ? `다음 충전 ${fmtTime(next)}` : '가득 참';
      const cost = game.ticketCost;
      buy1.textContent = `1장 · 청취자 ${formatNumber(cost)}`;
      buy10.textContent = `10장 · ${formatNumber(cost * 10)}`;
      if (buy1.disabled === game.canBuyTickets(1)) buy1.disabled = !game.canBuyTickets(1);
      if (buy10.disabled === game.canBuyTickets(10)) buy10.disabled = !game.canBuyTickets(10);
      if (levelUp.disabled === game.canLevelUpBox()) levelUp.disabled = !game.canLevelUpBox();
      const hint = s.box.pending ? '고르지 않은 장비가 있어요' : s.box.tickets > 0 ? '탭해서 열기' : '티켓 충전 중';
      if (boxHint.textContent !== hint) boxHint.textContent = hint;
      box.classList.toggle('is-ready', s.box.tickets > 0 || !!s.box.pending);
    },
  };
}

function autoSummary(game: Game): string {
  const a = game.state.box.auto;
  const parts = [a.minGrade ? `${getGrade(a.minGrade)?.name} 이상` : null, a.stopOnUpgrade ? '전투력 상승' : null].filter(Boolean);
  return parts.length ? `멈춤 조건: ${parts.join(' 또는 ')}` : '멈춤 조건 없음 (티켓을 다 쓸 때까지)';
}

/** 장비 효과 요약 칩 */
function bonusChips(game: Game): HTMLElement[] {
  const b = equipBonuses(game.state);
  const chips: HTMLElement[] = [];
  for (const k of STAT_KEYS) if (b.stats[k]) chips.push(h('span', { class: 'chip' }, `${STAT_LABELS[k]} +${b.stats[k]}`));
  for (const opt of SUB_OPTIONS) if (b[opt.id]) chips.push(h('span', { class: 'chip chip--sub' }, `${opt.name} +${fmtPct(b[opt.id])}`));
  if (chips.length === 0) chips.push(h('span', { class: 'chip chip--none' }, '장착한 장비가 없어요. 택배를 열어 보세요!'));
  return chips;
}

/** 택배 레벨별 등급 확률표 */
function openBoxRates(game: Game) {
  const current = game.state.box.level;
  const rows = [];
  for (let lv = 1; lv <= maxBoxLevel(); lv++) {
    const rates = boxRates(lv);
    rows.push(
      h(
        'tr',
        { class: lv === current ? 'is-current' : '' },
        h('td', {}, `Lv.${lv}`),
        ...GRADES.map((_, i) => h('td', { class: rates[i] ? '' : 'is-zero' }, rates[i] ? `${rates[i]}%` : '-')),
        h('td', {}, lv < maxBoxLevel() ? String(BALANCE.box.partsToNext[lv - 1]) : '최대'),
      ),
    );
  }
  const body = h(
    'div',
    { class: 'rates' },
    h(
      'table',
      { class: 'rates__table box-rates' },
      h('thead', {}, h('tr', {}, h('th', {}, '레벨'), ...GRADES.map((g) => h('th', { style: `color:${g.color}` }, g.name)), h('th', {}, '다음 부품'))),
      h('tbody', {}, ...rows),
    ),
    h(
      'ul',
      { class: 'rates__rules' },
      h('li', {}, `지금 택배는 Lv.${current}이에요 (표에서 강조된 줄).`),
      h('li', {}, '장비를 분해하면 부품과 전파석을 얻고, 부품을 모아 택배 레벨을 올릴 수 있어요.'),
      h('li', {}, `택배 레벨이 1 오를 때마다 나오는 장비의 주 스탯도 +${Math.round(BALANCE.box.statPerLevel * 100)}% 높아져요.`),
      h('li', {}, `부가옵션 개수: ${GRADES.map((g) => `${g.name} ${g.subCount[0] === g.subCount[1] ? g.subCount[0] : `${g.subCount[0]}~${g.subCount[1]}`}개`).join(' · ')}`),
      h('li', {}, `자동 개봉은 택배 Lv.${BALANCE.box.autoUnlockLevel}에서 열려요.`),
    ),
  );
  openModal({ title: '택배 확률표', body, confirmLabel: '닫기', wide: true });
}

/** 자동 개봉 설정 → 시작 */
function openAutoSettings(game: Game, onStart: () => void) {
  const settings = { ...game.state.box.auto };
  const gradeChips = h('div', { class: 'chips' });
  const options: (string | null)[] = [null, ...GRADES.slice(1).map((g) => g.id)];
  const renderChips = () =>
    gradeChips.replaceChildren(
      ...options.map((id) => {
        const btn = h('button', { class: `chip-btn${settings.minGrade === id ? ' is-on' : ''}`, type: 'button' }, id ? `${getGrade(id)?.name} 이상` : '사용 안 함');
        if (id) btn.style.setProperty('--grade', gradeColor(id));
        onTap(btn, () => {
          settings.minGrade = id;
          renderChips();
        });
        return btn;
      }),
    );
  renderChips();

  const toggle = h('button', { class: 'toggle', type: 'button', role: 'switch' }, h('span', { class: 'toggle__knob' }));
  const renderToggle = () => {
    toggle.classList.toggle('is-on', settings.stopOnUpgrade);
    toggle.setAttribute('aria-checked', String(settings.stopOnUpgrade));
  };
  onTap(toggle, () => {
    settings.stopOnUpgrade = !settings.stopOnUpgrade;
    renderToggle();
  });
  renderToggle();

  const body = h(
    'div',
    { class: 'auto' },
    h('h3', {}, '이 등급 이상이면 멈추기'),
    gradeChips,
    h('div', { class: 'auto__row' }, h('div', {}, h('h3', {}, '전투력이 오르면 멈추기'), h('p', {}, '지금 낀 같은 부위 장비보다 전투력이 높으면 멈춰요.')), toggle),
    h('p', { class: 'auto__note' }, `조건에 맞지 않는 장비는 자동으로 분해돼요. 티켓 ${game.state.box.tickets}장 보유 · 언제든 중지할 수 있어요.`),
  );
  openModal({
    title: '자동 개봉',
    body,
    cancelLabel: '취소',
    confirmLabel: '자동 개봉 시작',
    onConfirm: () => {
      game.setAutoSettings(settings);
      onStart();
    },
  });
}

/** 부품 → 튜닝 키트 교환 창 */
function openKitExchange(game: Game) {
  const per = BALANCE.kits.partsPerKit;
  const info = h('p', { class: 'kit__info' });
  const btns = h('div', { class: 'kit__btns' });
  const render = () => {
    const s = game.state;
    const max = Math.floor(s.box.parts / per);
    info.replaceChildren(
      `부품 ${per}개 → 튜닝 키트 1개. 키트는 카드 강화에 써요.`,
      h('br'),
      h('strong', {}, `보유 부품 ${s.box.parts} · 키트 ${s.kits}`),
    );
    btns.replaceChildren(
      ...[1, 5, max].filter((n, i, a) => n > 0 && a.indexOf(n) === i).map((n) => {
        const b = h('button', { class: 'btn btn--primary btn--small', type: 'button' }, n === max && n > 5 ? `전부 (${n}개)` : `${n}개`);
        onTap(b, () => {
          if (game.exchangeKits(n)) {
            sfx.coin();
            popNumber(b, `🔧 +${n}`, 'fx-pop--kit');
            render();
          }
        });
        return b;
      }),
    );
    if (max === 0) btns.append(h('span', { class: 'kit__none' }, `부품이 ${per - s.box.parts}개 더 필요해요`));
  };
  render();
  openModal({ title: '🔧 튜닝 키트 교환', body: h('div', { class: 'kit' }, info, btns), confirmLabel: '닫기', confirmGhost: true });
}
