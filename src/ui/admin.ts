/**
 * 테스트용 관리자 치트 패널.
 * - 평소엔 숨김. 타이틀 화면 로고를 config/admin.json의 logoTaps번 연속 탭 → 비밀번호(password) → 열림
 * - 한 번 열면 화면 구석에 톱니 버튼 (이 기기에만 기억, localStorage). 패널에서 '관리자 모드 끄기'
 * - 상태를 바꾸는 치트는 game.cheat()로: 세이브에 '치트 사용' 표시가 남는다 (state.cheat.used)
 */
import { ADMIN_PASSWORD } from '../core/admin';
import { BALANCE } from '../data/balance';
import { CARDS, getCard, RARITIES, type Rarity } from '../data/cards';
import { CARD_STORY_IDS, getCardStory } from '../data/cardStories';
import { EVENTS } from '../data/events';
import { MEMBERS, getMember } from '../data/members';
import { ACTIONS, EMOTES, ENDINGS, EPISODES, NARRATIVE, SCREENS, type ScriptLine } from '../data/narrative';
import { cardBondLevel } from '../core/cardBond';
import { maxCardLevel } from '../core/economy';
import { eventProgress } from '../core/events';
import { endingKey } from '../core/story';
import type { Game } from '../core/game';
import { migrate } from '../core/save';
import { memberBondLevel } from '../core/bond';
import { formatNumber } from '../utils/format';
import { BGM_TRACKS, playBgm } from './audio';
import { playCardEpisode } from './cardStory';
import { h, onTap } from './dom';
import { playEvent } from './members';
import { playEnding, playEpisode, playEventEpisode } from './storyView';
import { playScript } from './vn';

const ADMIN_KEY = 'simya-bangsongbu/admin';
export function isAdminOn(): boolean {
  try {
    return localStorage.getItem(ADMIN_KEY) === '1';
  } catch {
    return false;
  }
}

function setAdminOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(ADMIN_KEY, '1');
    else localStorage.removeItem(ADMIN_KEY);
  } catch {
    // 무시
  }
}

// ───────────── 여는 방법 (로고 연속 탭은 core/admin.ts의 logoTapCounter)

/** 비밀번호 입력창. 맞으면 관리자 모드 켜고 패널을 연다 */
export function promptAdminPassword(game: Game): void {
  document.querySelector('.admin-lock')?.remove();
  const input = h('input', { class: 'admin-lock__input', type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: '비밀번호', 'aria-label': '관리자 비밀번호' }) as HTMLInputElement;
  const msg = h('p', { class: 'admin-lock__msg' }, '관리자 비밀번호를 입력하세요');
  const ok = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '확인');
  const cancel = h('button', { class: 'admin-btn', type: 'button' }, '취소');
  const el = h('div', { class: 'admin-lock', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'admin-lock__box' }, h('strong', {}, '🛠️ 관리자 모드'), msg, input, h('div', { class: 'admin-row' }, cancel, ok)));
  // 타이틀 화면을 누른 것으로 치지 않게
  el.addEventListener('click', (e) => e.stopPropagation());
  const submit = () => {
    if (input.value === ADMIN_PASSWORD) {
      el.remove();
      setAdminOn(true);
      mountAdminGear(game);
      openAdminPanel(game);
    } else {
      msg.textContent = '비밀번호가 틀렸어요';
      msg.classList.add('is-error');
      input.value = '';
      input.focus();
    }
  };
  onTap(ok, submit);
  onTap(cancel, () => el.remove());
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  document.body.append(el);
  setTimeout(() => input.focus(), 50);
}

/** 화면 구석 톱니 버튼 (관리자 모드일 때만) */
export function mountAdminGear(game: Game): void {
  if (!isAdminOn() || document.querySelector('.admin-gear')) return;
  const gear = h('button', { class: 'admin-gear', type: 'button', 'aria-label': '관리자 패널', title: '관리자 패널' }, '🛠️');
  gear.addEventListener('click', (e) => e.stopPropagation());
  onTap(gear, () => openAdminPanel(game));
  document.body.append(gear);
}

// ───────────── 패널

type TabId = 'money' | 'cards' | 'gacha' | 'time' | 'story' | 'fx' | 'data';
const TABS: { id: TabId; label: string }[] = [
  { id: 'money', label: '💎 재화' },
  { id: 'cards', label: '🃏 카드·캐릭터' },
  { id: 'gacha', label: '✉️ 가챠' },
  { id: 'time', label: '⏰ 시간·이벤트' },
  { id: 'story', label: '📖 스토리' },
  { id: 'fx', label: '🎬 연출' },
  { id: 'data', label: '💾 데이터' },
];

let lastTab: TabId = 'money';

export function openAdminPanel(game: Game, tab: TabId = lastTab): void {
  document.querySelector('.admin')?.remove();
  let current = tab;
  const status = h('div', { class: 'admin__status' });
  const tabs = h('div', { class: 'admin__tabs', role: 'tablist' });
  const body = h('div', { class: 'admin__body' });
  const close = h('button', { class: 'admin-btn admin__close', type: 'button', 'aria-label': '닫기' }, '✕ 닫기');
  const flash = h('div', { class: 'admin__flash', 'aria-live': 'polite' });
  const root = h('div', { class: 'admin', role: 'dialog', 'aria-modal': 'true', 'aria-label': '관리자 패널' }, h('div', { class: 'admin__top' }, h('strong', { class: 'admin__title' }, '🛠️ 관리자 패널'), status, close), tabs, body, flash);
  root.addEventListener('click', (e) => e.stopPropagation());
  onTap(close, () => root.remove());
  document.body.append(root);

  let flashTimer = 0;
  /** 결과 한 줄 (패널 아래쪽) */
  const done = (text: string) => {
    flash.textContent = `✓ ${text}`;
    flash.classList.add('is-on');
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => flash.classList.remove('is-on'), 2200);
    render();
  };
  /** 치트 적용 + 결과 표시 */
  const apply = (text: string, fn: Parameters<Game['cheat']>[0]) => {
    game.cheat(fn);
    done(text);
  };
  /** 패널을 닫고 무언가를 재생, 끝나면 같은 탭으로 다시 연다 */
  const away = (fn: (back: () => void) => void) => {
    root.remove();
    fn(() => openAdminPanel(game, current));
  };

  const tabBtns = TABS.map((t) => {
    const b = h('button', { class: 'admin__tab', type: 'button', role: 'tab' }, t.label);
    onTap(b, () => {
      current = t.id;
      lastTab = t.id;
      render();
    });
    return { ...t, b };
  });
  tabs.append(...tabBtns.map((t) => t.b));

  function render() {
    if (!document.body.contains(root)) return;
    const c = game.state.cheat;
    status.textContent = c.used ? `⚠️ 치트 사용 세이브 · ${c.count}회 (처음 ${new Date(c.firstUsedAt).toLocaleDateString('ko-KR')})` : '치트 미사용 세이브';
    status.classList.toggle('is-used', c.used);
    for (const t of tabBtns) {
      t.b.classList.toggle('is-active', t.id === current);
      t.b.setAttribute('aria-selected', String(t.id === current));
    }
    const scroll = body.scrollTop;
    const view = { money, cards, gacha, time, story, fx, data }[current]();
    body.replaceChildren(view);
    body.scrollTop = scroll;
  }

  // ── 재화
  function money(): HTMLElement {
    const s = game.state;
    const ev = game.event() ?? EVENTS[EVENTS.length - 1];
    type Cur = { label: string; get: () => number; set: (v: number) => void; step: number; max: number };
    const list: Cur[] = [
      { label: '📻 청취자', get: () => s.listeners, set: (v) => ((s.listeners = v), (s.totalListeners = Math.max(s.totalListeners, v))), step: 1_000_000, max: 1e15 },
      { label: '💎 전파석', get: () => s.stones, set: (v) => (s.stones = v), step: 1000, max: 9_999_999 },
      ...(ev ? [{ label: `🍬 ${ev.currency.name}`, get: () => s.events.progress[ev.id]?.candy ?? 0, set: (v: number) => (eventProgress(s, ev.id).candy = v), step: 300, max: 999_999 }] : []),
      { label: '🎫 택배 티켓', get: () => s.box.tickets, set: (v) => (s.box.tickets = v), step: 50, max: 99_999 },
      { label: '⚙️ 부품', get: () => s.box.parts, set: (v) => (s.box.parts = v), step: 500, max: 9_999_999 },
      { label: '🔧 튜닝 키트', get: () => s.kits, set: (v) => (s.kits = v), step: 50, max: 99_999 },
    ];
    const rows = list.map((cur) => {
      const input = h('input', { class: 'admin-input', type: 'number', inputmode: 'numeric', min: 0, value: cur.step }) as HTMLInputElement;
      const add = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '+ 추가');
      const zero = h('button', { class: 'admin-btn', type: 'button' }, '0으로');
      onTap(add, () => {
        const n = Math.max(0, Number(input.value) || 0);
        apply(`${cur.label} +${formatNumber(n)}`, () => cur.set(Math.min(cur.max, cur.get() + n)));
      });
      onTap(zero, () => apply(`${cur.label} 0`, () => cur.set(0)));
      return h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, cur.label), h('span', { class: 'admin-num' }, formatNumber(cur.get()))), h('div', { class: 'admin-row' }, input, add, zero));
    });
    const max = h('button', { class: 'admin-btn admin-btn--primary admin-btn--wide', type: 'button' }, '⬆️ 전부 최대치');
    onTap(max, () => apply('모든 재화 최대치', () => list.forEach((cur) => cur.set(cur.max))));
    return h('div', { class: 'admin-view' }, max, ...rows);
  }

  // ── 카드·캐릭터
  let pickedCard = CARDS[0].id;
  function cards(): HTMLElement {
    const s = game.state;
    const select = h(
      'select',
      { class: 'admin-select' },
      ...[...RARITIES].map((r) =>
        h('optgroup', { label: r }, ...CARDS.filter((c) => c.rarity === r).map((c) => h('option', { value: c.id, selected: c.id === pickedCard }, `${s.cards[c.id] ? '✔ ' : ''}${getMember(c.member)?.name} · ${c.title}${c.limited ? ' (한정)' : ''}`))),
      ),
    ) as HTMLSelectElement;
    select.addEventListener('change', () => {
      pickedCard = select.value;
      render();
    });
    const card = getCard(pickedCard)!;
    const owned = s.cards[pickedCard];
    const give = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, owned ? '한 장 더 (돌파)' : '지급');
    onTap(give, () =>
      apply(`${card.title} 지급`, (st) => {
        const o = st.cards[card.id];
        if (!o) st.cards[card.id] = { limitBreak: 0, level: 1, obtainedAt: Date.now() };
        else o.limitBreak = Math.min(BALANCE.limitBreak.max, o.limitBreak + 1);
      }),
    );
    const all = h('button', { class: 'admin-btn admin-btn--primary admin-btn--wide', type: 'button' }, '🃏 모든 카드 지급');
    onTap(all, () =>
      apply(`카드 ${CARDS.length}장 모두 지급`, (st) => {
        for (const c of CARDS) st.cards[c.id] ??= { limitBreak: 0, level: 1, obtainedAt: Date.now() };
      }),
    );
    const lb = h('input', { class: 'admin-input', type: 'number', min: 0, max: BALANCE.limitBreak.max, value: owned?.limitBreak ?? 0 }) as HTMLInputElement;
    const lv = h('input', { class: 'admin-input', type: 'number', min: 1, value: owned?.level ?? 1 }) as HTMLInputElement;
    const setCard = h('button', { class: 'admin-btn admin-btn--primary', type: 'button', disabled: !owned }, '적용');
    onTap(setCard, () => {
      const b = Math.max(0, Math.min(BALANCE.limitBreak.max, Math.floor(Number(lb.value) || 0)));
      const l = Math.max(1, Math.min(maxCardLevel(b), Math.floor(Number(lv.value) || 1)));
      apply(`${card.title} 돌파 ${b} · Lv.${l}`, (st) => {
        const o = st.cards[card.id];
        if (o) Object.assign(o, { limitBreak: b, level: l });
      });
    });
    const cardBondRow = getCardStory(card.id)
      ? levelPicker(`💜 카드 호감도 (최대 Lv.${BALANCE.cardBond.maxLevel})`, cardBondLevel(s, card.id), BALANCE.cardBond.maxLevel, !!owned, (n) =>
          apply(`${card.title} 카드 호감도 Lv.${n}`, (st) => {
            const b = (st.cardBond[card.id] ??= { xp: 0, day: '', talks: 0 });
            b.xp = BALANCE.cardBond.xpTable[n - 1];
          }),
        )
      : null;
    const bonds = MEMBERS.map((m) =>
      levelPicker(`${m.name}`, memberBondLevel(s, m.id), BALANCE.bond.maxLevel, true, (n) =>
        apply(`${m.name} 호감도 Lv.${n}`, (st) => {
          st.bond[m.id].xp = BALANCE.bond.xpTable[n - 1];
        }),
      ),
    );
    return h(
      'div',
      { class: 'admin-view' },
      all,
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '카드 고르기'), h('small', {}, owned ? `보유 · 돌파 ${owned.limitBreak} · Lv.${owned.level}` : '미보유')), select, h('div', { class: 'admin-row' }, give)),
      h(
        'div',
        { class: 'admin-card' },
        h('div', { class: 'admin-card__head' }, h('strong', {}, '레벨·돌파 직접 설정'), h('small', {}, owned ? `돌파 0~${BALANCE.limitBreak.max} · 레벨은 돌파에 따라 최대 ${maxCardLevel(Number(lb.value) || 0)}` : '먼저 지급하세요')),
        h('div', { class: 'admin-row' }, h('label', { class: 'admin-field' }, '돌파', lb), h('label', { class: 'admin-field' }, '레벨', lv), setCard),
        cardBondRow,
      ),
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '💗 캐릭터 호감도 레벨')), ...bonds),
    );
  }

  function levelPicker(label: string, now: number, max: number, enabled: boolean, onSet: (n: number) => void): HTMLElement {
    const sel = h('select', { class: 'admin-select admin-select--small', disabled: !enabled }, ...Array.from({ length: max }, (_, i) => h('option', { value: i + 1, selected: i + 1 === now }, `Lv.${i + 1}`))) as HTMLSelectElement;
    const b = h('button', { class: 'admin-btn admin-btn--primary', type: 'button', disabled: !enabled }, '설정');
    onTap(b, () => onSet(Number(sel.value)));
    return h('div', { class: 'admin-row admin-row--level' }, h('span', { class: 'admin-row__label' }, label, h('small', {}, ` 지금 Lv.${now}`)), sel, b);
  }

  // ── 가챠
  function gacha(): HTMLElement {
    const s = game.state;
    const choices: (Rarity | null)[] = [null, 'R', 'SR', 'SSR', 'U'];
    const fixRow = h(
      'div',
      { class: 'admin-row admin-row--wrap' },
      ...choices.map((r) => {
        const b = h('button', { class: `admin-btn${s.cheat.nextRarity === r ? ' is-on' : ''}`, type: 'button' }, r ?? '고정 안 함');
        onTap(b, () => apply(r ? `다음 뽑기 ${r} 고정` : '등급 고정 해제', (st) => (st.cheat.nextRarity = r)));
        return b;
      }),
    );
    const ev = game.event() ?? EVENTS[EVENTS.length - 1];
    const pityRows: [string, () => number, (v: number) => void, number][] = [
      ['상시 모집 (SSR 천장)', () => s.gacha.pity, (v) => (s.gacha.pity = v), BALANCE.gacha.pity],
      ...Object.keys(s.gacha.bannerPity).map((id) => [`한정 모집 ${id}`, () => s.gacha.bannerPity[id] ?? 0, (v: number) => (s.gacha.bannerPity[id] = v), BALANCE.gacha.pity] as [string, () => number, (v: number) => void, number]),
      ...(ev ? [[`${ev.gacha.name} (U 천장)`, () => s.events.progress[ev.id]?.pity ?? 0, (v: number) => (eventProgress(s, ev.id).pity = v), ev.gacha.pity] as [string, () => number, (v: number) => void, number]] : []),
    ];
    const pities = pityRows.map(([label, get, set, max]) => {
      const input = h('input', { class: 'admin-input', type: 'number', min: 0, max: max - 1, value: get() }) as HTMLInputElement;
      const b = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '설정');
      const z = h('button', { class: 'admin-btn', type: 'button' }, '초기화');
      onTap(b, () => apply(`${label} 천장 ${input.value}`, () => set(Math.max(0, Math.min(max - 1, Math.floor(Number(input.value) || 0))))));
      onTap(z, () => apply(`${label} 천장 초기화`, () => set(0)));
      return h('div', { class: 'admin-row admin-row--level' }, h('span', { class: 'admin-row__label' }, label, h('small', {}, ` ${get()} / ${max}`)), input, b, z);
    });
    const resetAll = h('button', { class: 'admin-btn admin-btn--wide', type: 'button' }, '천장 카운트 전부 초기화');
    onTap(resetAll, () => apply('천장 전부 초기화', () => pityRows.forEach(([, , set]) => set(0))));
    return h(
      'div',
      { class: 'admin-view' },
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '다음 뽑기 등급 고정'), h('small', {}, '끌 때까지 모든 뽑기(상시·한정·할로윈)가 이 등급. 천장보다 우선')), fixRow),
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '천장 카운트')), ...pities, resetAll),
    );
  }

  // ── 시간·이벤트
  function time(): HTMLElement {
    const s = game.state;
    const skips = [1, 12, 24].map((hr) => {
      const b = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, `⏩ ${hr}시간`);
      onTap(b, () => away(() => game.skipTime(hr * 3_600_000)));
      return b;
    });
    const accident = h('button', { class: 'admin-btn admin-btn--primary admin-btn--wide', type: 'button' }, '📡 방송사고(전파 이탈) 지금 발생');
    // 방송실 화면에서 바로 (liveEvents가 이 이벤트를 듣는다). 아무도 배치 안 했으면 일어나지 않는다
    onTap(accident, () => away(() => document.dispatchEvent(new CustomEvent('simya:accident'))));
    const rec = s.records;
    const daily = h('button', { class: 'admin-btn admin-btn--primary admin-btn--wide', type: 'button' }, '📋 일일 미션 강제 초기화');
    onTap(daily, () => {
      apply('일일 미션·이벤트 일일 미션·대화/선물/교감 횟수 초기화', (st) => {
        st.missions.day = '';
        for (const p of Object.values(st.events.progress)) {
          p.daily.day = '';
          p.ghost.day = '';
        }
        for (const b of Object.values(st.bond)) b.day = '';
        for (const b of Object.values(st.cardBond)) b.day = '';
      });
      game.advance();
    });
    const ev = EVENTS[EVENTS.length - 1];
    const live = game.event();
    const mode = s.cheat.eventOff ? '강제 종료 중' : s.events.force ? '강제 시작 중' : '기간대로';
    const start = h('button', { class: `admin-btn${s.events.force && !s.cheat.eventOff ? ' is-on' : ''}`, type: 'button' }, '▶ 강제 시작');
    const end = h('button', { class: `admin-btn${s.cheat.eventOff ? ' is-on' : ''}`, type: 'button' }, '■ 강제 종료');
    const normal = h('button', { class: `admin-btn${!s.events.force && !s.cheat.eventOff ? ' is-on' : ''}`, type: 'button' }, '📅 기간대로');
    onTap(start, () => apply('이벤트 강제 시작', (st) => ((st.cheat.eventOff = false), (st.events.force = true))));
    onTap(end, () => {
      apply('이벤트 강제 종료 (남은 재화 환산)', (st) => ((st.events.force = false), (st.cheat.eventOff = true)));
      game.advance();
    });
    onTap(normal, () => apply('이벤트 기간대로', (st) => ((st.events.force = false), (st.cheat.eventOff = false))));
    const reopen = h('button', { class: 'admin-btn', type: 'button' }, '환산 기록 지우기');
    onTap(reopen, () => apply('이벤트 환산 기록 초기화', (st) => Object.values(st.events.progress).forEach((p) => (p.converted = false))));
    return h(
      'div',
      { class: 'admin-view' },
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '오프라인 보상 테스트'), h('small', {}, `그 시간만큼 자리를 비웠던 것처럼 (최대 ${BALANCE.offlineCapMs / 3_600_000}시간까지 보상)`)), h('div', { class: 'admin-row' }, ...skips)),
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '방송사고 테스트'), h('small', {}, `복구 ${rec.accidentsFixed} · 완벽 ${rec.perfectFixes} · 실패 ${rec.accidentsFailed}`)), accident),
      h('div', { class: 'admin-card' }, daily),
      h(
        'div',
        { class: 'admin-card' },
        h('div', { class: 'admin-card__head' }, h('strong', {}, `이벤트: ${ev?.name ?? '없음'}`), h('small', {}, `${mode} · 지금 ${live ? '진행 중' : '닫힘'}`)),
        ev ? h('p', { class: 'admin-note' }, `기간 ${new Date(ev.start).toLocaleString('ko-KR')} ~ ${new Date(ev.end).toLocaleString('ko-KR')}. 강제 종료하면 끝난 것처럼 남은 재화를 전파석으로 바꿔요.`) : null,
        h('div', { class: 'admin-row admin-row--wrap' }, start, end, normal, reopen),
      ),
    );
  }

  // ── 스토리
  let pickedStory = EPISODES[0]?.key ?? '';
  function story(): HTMLElement {
    const s = game.state;
    const unlock = h('button', { class: `admin-btn admin-btn--wide${s.cheat.storyUnlocked ? ' is-on' : ''}`, type: 'button' }, s.cheat.storyUnlocked ? '🔓 모든 스토리 해금 중 (끄기)' : '🔓 모든 챕터·개인 이벤트·이벤트/전용 스토리 해금');
    onTap(unlock, () => apply(s.cheat.storyUnlocked ? '스토리 해금 끔' : '모든 스토리 해금', (st) => (st.cheat.storyUnlocked = !st.cheat.storyUnlocked)));
    const seen = (k: string) => (s.story.seen.includes(k) ? ' ✔' : '');
    const select = h(
      'select',
      { class: 'admin-select' },
      h('optgroup', { label: '메인 스토리' }, ...EPISODES.map((e) => h('option', { value: `ep|${e.key}`, selected: pickedStory === `ep|${e.key}` }, `${e.key} ${e.title}${seen(e.key)}`))),
      h('optgroup', { label: '엔딩' }, ...ENDINGS.map((e) => h('option', { value: `end|${e.id}`, selected: pickedStory === `end|${e.id}` }, `${e.id === 'true' ? '진엔딩' : getMember(e.id)?.name} · ${e.title}${seen(endingKey(e.id))}`))),
      h(
        'optgroup',
        { label: '개인 이벤트' },
        ...MEMBERS.flatMap((m) => (NARRATIVE.events[m.id] ?? []).map((e) => h('option', { value: `bond|${m.id}|${e.level}`, selected: pickedStory === `bond|${m.id}|${e.level}` }, `${m.name} 💗${e.level} ${e.title}${s.bond[m.id]?.seenEvents.includes(e.level) ? ' ✔' : ''}`))),
      ),
      h('optgroup', { label: '이벤트 스토리' }, ...EVENTS.flatMap((ev) => ev.story.map((e) => h('option', { value: `ev|${e.key}`, selected: pickedStory === `ev|${e.key}` }, `${ev.name} ${e.no}화 ${e.title}${seen(e.key)}`)))),
      h(
        'optgroup',
        { label: 'U 전용 스토리' },
        ...CARD_STORY_IDS.flatMap((id) => getCardStory(id)!.episodes.map((e) => h('option', { value: `card|${e.key}`, selected: pickedStory === `card|${e.key}` }, `${getCardStory(id)!.title} ${e.no}화 ${e.title}${seen(e.key)}`))),
      ),
    ) as HTMLSelectElement;
    if (!pickedStory) pickedStory = select.value;
    select.addEventListener('change', () => (pickedStory = select.value));
    const play = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '▶ 바로 보기');
    onTap(play, () => {
      const v = select.value;
      pickedStory = v;
      // 잠긴 화도 볼 수 있게 해금을 켠다
      if (!game.state.cheat.storyUnlocked) game.cheat((st) => (st.cheat.storyUnlocked = true));
      const [kind, a, b] = v.split('|');
      away(() => {
        if (kind === 'ep') playEpisode(game, a);
        else if (kind === 'end') playEnding(game, a);
        else if (kind === 'bond') playEvent(game, a, Number(b));
        else if (kind === 'ev') playEventEpisode(game, a);
        else if (kind === 'card') playCardEpisode(game, a);
      });
    });
    const reset = h('button', { class: 'admin-btn admin-btn--danger admin-btn--wide', type: 'button' }, '🗑️ 스토리 진행 기록 초기화');
    onTap(reset, () =>
      confirmIn(root, '본 화·엔딩·개인 이벤트·이벤트/전용 스토리 기록을 모두 지울까요?', () =>
        apply('스토리 진행 기록 초기화', (st) => {
          st.story.seen = [];
          for (const b of Object.values(st.bond)) b.seenEvents = [];
        }),
      ),
    );
    const total = EPISODES.length + ENDINGS.length;
    const seenMain = EPISODES.filter((e) => s.story.seen.includes(e.key)).length + ENDINGS.filter((e) => s.story.seen.includes(endingKey(e.id))).length;
    return h(
      'div',
      { class: 'admin-view' },
      unlock,
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '원하는 화로 바로 이동'), h('small', {}, `메인 ${seenMain}/${total} 봄 · ✔ = 본 화`)), select, h('div', { class: 'admin-row' }, play)),
      reset,
    );
  }

  // ── 연출
  function fx(): HTMLElement {
    const test = (title: string, lines: ScriptLine[]) =>
      away((back) => playScript({ title: `연출 테스트 · ${title}`, lines, replay: true, name: game.state.story.name || '나', onEnd: back }));
    const ready: ScriptLine = { bg: 'broadcast', s: 'yuri', e: 'neutral', t: '(준비) 다음 대사에서 재생해요' };
    const group = (label: string, list: readonly string[], make: (tag: string) => ScriptLine[]) =>
      h(
        'div',
        { class: 'admin-card' },
        h('div', { class: 'admin-card__head' }, h('strong', {}, label)),
        h(
          'div',
          { class: 'admin-grid' },
          ...list.map((tag) => {
            const b = h('button', { class: 'admin-btn', type: 'button' }, tag);
            onTap(b, () => test(`${label} ${tag}`, make(tag)));
            return b;
          }),
        ),
      );
    const bgm = h(
      'div',
      { class: 'admin-grid' },
      ...BGM_TRACKS.map((id) => {
        const b = h('button', { class: 'admin-btn', type: 'button' }, `♪ ${id}`);
        onTap(b, () => {
          playBgm(id);
          done(`BGM ${id} 재생`);
        });
        return b;
      }),
      (() => {
        const b = h('button', { class: 'admin-btn admin-btn--danger', type: 'button' }, '■ 정지');
        onTap(b, () => {
          playBgm(null);
          done('BGM 정지');
        });
        return b;
      })(),
    );
    return h(
      'div',
      { class: 'admin-view' },
      h('p', { class: 'admin-note' }, '버튼을 누르면 짧은 장면으로 바로 재생해요 (첫 대사 다음에 효과). 끝나면 패널로 돌아와요.'),
      group('action', ACTIONS, (a) => [ready, { s: 'yuri', e: 'smile', t: `action: ${a}`, action: [a as never] }]),
      group('emote', EMOTES, (a) => [ready, { s: 'yuri', e: 'neutral', t: `emote: ${a}`, emote: [a as never] }]),
      group('screen', SCREENS, (a) => [ready, { t: `screen: ${a}`, screen: [a as never] }, { t: '(다음 대사)' }]),
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, 'BGM')), bgm),
    );
  }

  // ── 데이터
  function data(): HTMLElement {
    const out = h('textarea', { class: 'admin-text', readonly: true, rows: 6 }) as HTMLTextAreaElement;
    out.value = JSON.stringify(game.state);
    const copy = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '📋 복사');
    onTap(copy, async () => {
      out.select();
      try {
        await navigator.clipboard.writeText(out.value);
        done('세이브를 클립보드에 복사했어요');
      } catch {
        document.execCommand?.('copy');
        done('텍스트를 선택했어요 — 직접 복사하세요');
      }
    });
    const input = h('textarea', { class: 'admin-text', rows: 6, placeholder: '백업해 둔 세이브 텍스트를 붙여넣으세요' }) as HTMLTextAreaElement;
    const load = h('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '📥 불러오기');
    onTap(load, () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.value);
        if (typeof parsed !== 'object' || parsed === null) throw new Error('객체가 아님');
      } catch {
        done('⚠️ 세이브 텍스트가 올바르지 않아요');
        return;
      }
      confirmIn(root, '지금 진행 상황을 이 세이브로 덮어쓸까요?', () => {
        const state = migrate(parsed, Date.now());
        game.replaceState(state);
        game.cheat(() => {});
        location.reload();
      });
    });
    const wipe = h('button', { class: 'admin-btn admin-btn--danger admin-btn--wide', type: 'button' }, '💣 전체 초기화');
    onTap(wipe, () =>
      confirmIn(root, '정말 모든 데이터를 지울까요? (1/2)', () =>
        confirmIn(root, '되돌릴 수 없어요. 그래도 지울까요? (2/2)', () => {
          game.reset();
          location.reload();
        }),
      ),
    );
    const off = h('button', { class: 'admin-btn admin-btn--wide', type: 'button' }, '🔒 관리자 모드 끄기');
    onTap(off, () => {
      setAdminOn(false);
      document.querySelector('.admin-gear')?.remove();
      root.remove();
    });
    return h(
      'div',
      { class: 'admin-view' },
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '세이브 내보내기 (백업)'), h('small', {}, `${formatNumber(out.value.length)}자`)), out, h('div', { class: 'admin-row' }, copy)),
      h('div', { class: 'admin-card' }, h('div', { class: 'admin-card__head' }, h('strong', {}, '세이브 불러오기'), h('small', {}, '불러오면 새로고침돼요')), input, h('div', { class: 'admin-row' }, load)),
      wipe,
      off,
    );
  }

  render();
}

/** 패널 위에 뜨는 확인 창 */
function confirmIn(root: HTMLElement, message: string, onYes: () => void): void {
  const yes = h('button', { class: 'admin-btn admin-btn--danger', type: 'button' }, '확인');
  const no = h('button', { class: 'admin-btn', type: 'button' }, '취소');
  const el = h('div', { class: 'admin-confirm', role: 'alertdialog' }, h('div', { class: 'admin-confirm__box' }, h('p', {}, message), h('div', { class: 'admin-row' }, no, yes)));
  onTap(no, () => el.remove());
  onTap(yes, () => {
    el.remove();
    onYes();
  });
  root.append(el);
}
