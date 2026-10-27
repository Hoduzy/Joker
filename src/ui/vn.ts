import { getMember } from '../data/members';
import type { Action, Bgm, Emote, Screen, ScriptLine } from '../data/narrative';
import { QUESTION_LIFT, VOICE_PAUSE_MS, voiceFor } from '../data/voices';
import { STAND_REF_HEIGHT, standUrl, type StandExpression } from '../data/portraits';
import { playBgm } from './audio';
import { h, onTap } from './dom';
import { emoteSvg } from './emotes';
import { blip, cutVoice } from './voice';
import { reducedMotion } from './motion';
import { sfx } from './sfx';
import { playTitleCard, type TitleCard } from './titleCard';

/** 이벤트 CG: assets/cg/<부원 id>.png (아직 없으면 빈 칸으로 보여 준다) */
const cgFiles = import.meta.glob('/assets/cg/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const CG = new Map<string, string>();
for (const [file, url] of Object.entries(cgFiles)) {
  const m = /\/assets\/cg\/([^/]+)\.\w+$/.exec(file);
  if (m) CG.set(m[1], url);
}
export const cgUrl = (id: string) => CG.get(id);

/** 배경: assets/bg/<id>.png|jpg|webp (같은 이름이 여러 개면 png 우선). 없으면 CSS 그라데이션 */
const bgFiles = import.meta.glob('/assets/bg/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BG = new Map<string, string>();
for (const [file, url] of Object.entries(bgFiles).sort(([a], [b]) => (a.endsWith('.png') ? 1 : 0) - (b.endsWith('.png') ? 1 : 0))) {
  const m = /\/assets\/bg\/([^/]+)\.\w+$/.exec(file);
  if (m) BG.set(m[1], url);
}
export const bgUrl = (id: string) => BG.get(id);

const TYPE_MS = 32;
/** 말소리를 내지 않는 글자 (띄어쓰기·문장부호) */
const SILENT = /[\s.,!?…~·\-—–'"“”‘’()[\]『』「」:;]/;
/** 이 글자 뒤에는 살짝 쉬었다가 다음 글자 */
const STOP = /[.?!…]/;
/** 오토 모드: 글자가 다 나온 뒤 이만큼 + 글자당 시간 기다렸다 넘긴다 */
const AUTO_BASE_MS = 1100;
const AUTO_PER_CHAR_MS = 45;
const AUTO_KEY = 'simya-bangsongbu/vn-auto';

/** 동작마다 걸리는 시간(ms). 이 시간이 지나야 다음 대사로 넘어간다 */
const ACTION_MS: Record<Action, number> = {
  jump: 600,
  shake: 420,
  nod: 450,
  down: 500,
  closeup: 500,
  back: 450,
  slide_in_left: 500,
  slide_in_right: 500,
  fade_in: 500,
  fade_out: 450,
  slide_out: 450,
};
const SCREEN_MS: Partial<Record<Screen, number>> = { shake_small: 350, shake_big: 550, flash_white: 650 };
/** 암전: 까매지는 데 / 다시 밝아지는 데 */
const BLACK_IN_MS = 380;
const BLACK_OUT_MS = 480;
/** 감정 아이콘: 톡 커졌다가 1초쯤 머문 뒤 사라진다 */
const EMOTE_MS = 1400;
const ENTER_ACTIONS: Action[] = ['slide_in_left', 'slide_in_right', 'fade_in'];
const EXIT_ACTIONS: Action[] = ['fade_out', 'slide_out'];
/** 켜 두면 clear 할 때까지 유지되는 화면 효과 → 무대에 붙는 클래스 */
const PERSIST: Partial<Record<Screen, string>> = { vignette: 'is-vignette', blur_bg: 'is-blur', sepia: 'is-sepia' };

export interface ScriptOptions {
  /** 위쪽에 보이는 제목 (예: "CHAPTER 1 · 입부 첫날의 신호") */
  title: string;
  lines: readonly ScriptLine[];
  /** 선택지를 골랐을 때 (호감도 반영) */
  onChoice?: (xp: Record<string, number> | undefined) => void;
  /** 끝까지 봤으면 true, 중간에 닫았으면 false */
  onEnd?: (completed: boolean) => void;
  /** 다시보기: 선택지 호감도를 주지 않는다 */
  replay?: boolean;
  /** 주인공 이름 ({이름} 자리와 ‘나’ 이름표) */
  name?: string;
  /** 시작할 때 타이틀 카드 (에피소드·엔딩) */
  card?: TitleCard;
  /** 첫 줄에 bgm이 없을 때 틀 곡 (개인 이벤트는 romance) */
  bgm?: Bgm;
}

const toTrack = (b: Bgm) => (b === 'none' ? null : b);

type Side = 'left' | 'right';

interface Actor {
  id: string;
  /** 자리·밝기·등장 */
  el: HTMLElement;
  /** 유지되는 자세 (down·closeup) */
  pose: HTMLElement;
  /** 한 번 하는 동작 (jump·shake·nod·등장·퇴장) + 감정 아이콘 */
  motion: HTMLElement;
  /** 숨쉬기 + 스탠딩 이미지 */
  breath: HTMLElement;
  expr: StandExpression;
  side: Side;
  /** 마지막으로 말한 순서 (자리가 꽉 차면 오래 말 안 한 쪽이 나간다) */
  spoke: number;
}

interface LogEntry {
  name: string;
  color?: string;
  text: string;
  kind: 'line' | 'narration' | 'me' | 'choice';
}

/**
 * 비주얼 노벨 화면.
 * - 배경: 화면 가득, 장면이 바뀌면 페이드 (장면이 바뀌면 캐릭터도 퇴장)
 * - 캐릭터: 스탠딩을 화면 아래에 크게. 최대 2명(왼쪽/오른쪽), 말하는 쪽은 밝게
 * - 대사창: 한 글자씩, 탭하면 전부, 한 번 더 탭하면 다음. 로그·오토·빨리 감기
 * - 연출: 대사마다 action(동작)·emote(감정 아이콘)·screen(화면 효과). 연출이 끝나야 다음 대사로 넘어간다
 */
export function playScript(opts: ScriptOptions): void {
  document.querySelector('.vn')?.remove();
  const me = opts.name || '나';
  const fill = (text: string) => text.split('{이름}').join(me);
  const queue: ScriptLine[] = [...opts.lines];
  const log: LogEntry[] = [];
  const actors: Actor[] = [];
  let index = -1;
  let typing = 0;
  let autoTimer = 0;
  let full = '';
  let waitingChoice = false;
  let bg = '';
  let spokeClock = 0;
  let auto = readAuto();
  /** 이 시각(performance.now)까지 연출 중 — 그 전에 넘기려 하면 끝난 뒤로 미룬다 */
  let fxUntil = 0;
  let pending = 0;
  /** 퇴장 동작을 이미 한 줄 */
  let exitedAt = -1;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const busy = (ms: number) => (fxUntil = Math.max(fxUntil, performance.now() + ms));

  const bgLayer = h('div', { class: 'vn__bgs' });
  const cast = h('div', { class: 'vn__cast' });
  const cg = h('div', { class: 'vn__cg', hidden: true });
  const name = h('div', { class: 'vn__name' });
  const text = h('p', { class: 'vn__text' });
  const next = h('span', { class: 'vn__next', 'aria-hidden': 'true' }, '▼');
  const box = h('div', { class: 'vn__box' }, name, text, next);
  const choices = h('div', { class: 'vn__choices', hidden: true });
  const logBtn = h('button', { class: 'vn__btn', type: 'button' }, 'LOG');
  const autoBtn = h('button', { class: 'vn__btn', type: 'button', 'aria-pressed': String(auto) }, 'AUTO');
  const skip = h('button', { class: 'vn__btn', type: 'button' }, 'SKIP ▶▶');
  const close = h('button', { class: 'vn__btn vn__btn--close', type: 'button', 'aria-label': '닫기' }, '✕');
  const logPanel = h('div', { class: 'vn__log', hidden: true, role: 'dialog', 'aria-label': '지난 대사' });
  const vignette = h('div', { class: 'vn__vignette', 'aria-hidden': 'true' });
  const flash = h('div', { class: 'vn__flash', 'aria-hidden': 'true' });
  const black = h('div', { class: 'vn__black', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'vn__stage', role: 'button', 'aria-label': '다음 대사' }, bgLayer, cast, vignette, cg, box, flash, black);
  const root = h(
    'div',
    { class: 'vn', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
    stage,
    choices,
    h('div', { class: 'vn__top' }, h('div', { class: 'vn__title' }, opts.title), h('div', { class: 'vn__tools' }, logBtn, autoBtn, skip, close)),
    logPanel,
  );
  document.body.append(root);

  // ── 배경
  function setBg(id: string, instant = false) {
    if (id === bg) return;
    bg = id;
    const url = BG.get(id);
    const layer = h('div', { class: `vn__bg vn__bg--${id}` });
    if (url) {
      layer.style.backgroundImage = `url("${url}")`;
      layer.classList.add('has-image');
    }
    if (instant) layer.classList.add('is-on');
    bgLayer.append(layer);
    if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-on')));
    // 이전 배경은 새 배경이 다 나타난 뒤 지운다
    const old = [...bgLayer.children].slice(0, -1);
    setTimeout(() => old.forEach((o) => o.remove()), 700);
  }

  // ── 캐릭터
  function standImg(id: string, expr: StandExpression): HTMLImageElement {
    const { url, cropped } = standUrl(id, expr);
    const img = h('img', { class: `vn__stand${cropped ? '' : ' is-full'}`, src: url ?? '', alt: '', draggable: 'false' });
    // 스탠딩은 머리 크기를 맞춰 잘라 두었으므로, 원본 높이에 비례해서 띄운다 (짧은 그림은 그만큼 낮게, 화면 아래에 붙어서)
    if (cropped) {
      const fit = () => (img.style.height = `${(img.naturalHeight / STAND_REF_HEIGHT) * 100}%`);
      if (img.complete && img.naturalHeight) fit();
      else img.addEventListener('load', fit, { once: true });
    }
    return img;
  }

  /** 이미지가 그려질 준비가 되면 (실패해도) then */
  function whenReady(img: HTMLImageElement, then: () => void) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      then();
    };
    if (img.complete && img.naturalHeight) img.decode().then(go, go);
    else {
      img.addEventListener('load', () => img.decode().then(go, go), { once: true });
      img.addEventListener('error', go, { once: true });
    }
    setTimeout(go, 600);
  }

  // 이 대본에 나오는 스탠딩을 미리 받아 둔다: 등장·표정 바꿀 때 빈 화면이나 늦게 바뀌는 일이 없게
  const preloaded: HTMLImageElement[] = [];
  for (const line of opts.lines) {
    if (!line.s || line.s === 'me') continue;
    const { url } = standUrl(line.s, line.e ?? 'neutral');
    if (url && !preloaded.some((p) => p.src.endsWith(url))) {
      const img = new Image();
      img.src = url;
      img.decode().catch(() => {});
      preloaded.push(img);
    }
  }

  function layout() {
    for (const a of actors) {
      a.el.classList.toggle('is-solo', actors.length === 1);
      a.el.dataset.side = a.side;
    }
  }

  function exitActor(a: Actor) {
    actors.splice(actors.indexOf(a), 1);
    a.el.classList.add('is-leaving');
    setTimeout(() => a.el.remove(), 400);
  }

  /** 한 번 하는 애니메이션: 클래스를 다시 붙여서 처음부터 */
  function play(el: HTMLElement, fx: string) {
    for (const c of [...el.classList]) if (c.startsWith('fx-')) el.classList.remove(c);
    void el.offsetWidth;
    el.classList.add(`fx-${fx}`);
  }

  /** 퇴장 동작 (fade_out / slide_out): 이 대사를 넘길 때 */
  function leave(a: Actor, how: Action) {
    actors.splice(actors.indexOf(a), 1);
    play(a.motion, how === 'slide_out' ? `slide-out-${a.side}` : 'fade-out');
    setTimeout(() => a.el.remove(), ACTION_MS[how] + 30);
    layout();
  }

  function clearCast() {
    [...actors].forEach(exitActor);
  }

  /** 말하는 부원을 무대에 세우고(없으면 등장) 표정을 맞춘다. enter: 등장 방식 (slide_in_left/right, fade_in) */
  function showActor(id: string, expr: StandExpression, enter?: Action): Actor {
    let a = actors.find((x) => x.id === id);
    if (!a) {
      if (actors.length >= 2) exitActor([...actors].sort((x, y) => x.spoke - y.spoke)[0]);
      const side: Side =
        enter === 'slide_in_left' && actors[0]?.side !== 'left'
          ? 'left'
          : enter === 'slide_in_right' && actors[0]?.side !== 'right'
            ? 'right'
            : actors.length === 0
              ? 'left'
              : actors[0].side === 'left'
                ? 'right'
                : 'left';
      const member = getMember(id);
      const img = standImg(id, expr);
      const breath = h('div', { class: 'vn__breath' }, img);
      // 숨쉬기: 부원마다 박자를 다르게
      breath.style.setProperty('--breath-dur', `${(3.2 + Math.random() * 1.4).toFixed(2)}s`);
      breath.style.setProperty('--breath-delay', `${(-Math.random() * 4).toFixed(2)}s`);
      const motion = h('div', { class: 'vn__motion' }, breath);
      const pose = h('div', { class: 'vn__pose' }, motion);
      const el = h('div', { class: `vn__actor${enter ? '' : ' is-entering'}` }, pose);
      el.style.setProperty('--member-color', member?.color ?? '#fff');
      if (enter) motion.classList.add('is-hidden');
      cast.append(el);
      a = { id, el, pose, motion, breath, expr, side, spoke: 0 };
      actors.push(a);
      // 그 대사의 표정으로 그려질 준비가 된 다음에 나타난다
      whenReady(img, () =>
        requestAnimationFrame(() => {
          el.classList.remove('is-entering');
          if (enter) {
            motion.classList.remove('is-hidden');
            play(motion, enter.replace(/_/g, '-'));
          }
        }),
      );
    } else if (a.expr !== expr) {
      const prev = a.breath.querySelector('img:last-child');
      const nextImg = standImg(id, expr);
      a.expr = expr;
      if (!prev || (prev as HTMLImageElement).src !== nextImg.src) {
        if (a.el.classList.contains('is-dim')) {
          // 어두운 채로 말을 시작하면: 밝아지기 전에 표정부터 바꿔 둔다 (밝아지는 동안 표정이 바뀌지 않게)
          a.breath.replaceChildren(nextImg);
        } else {
          // 계속 말하는 중이면 새 표정을 위에 올려 서서히
          nextImg.classList.add('is-fading');
          a.breath.append(nextImg);
          const el = a.breath;
          whenReady(nextImg, () =>
            requestAnimationFrame(() => {
              nextImg.classList.remove('is-fading');
              // 새 표정이 다 나타난 뒤 아래 이미지를 치운다
              setTimeout(() => [...el.querySelectorAll('img')].filter((i) => i !== el.lastElementChild).forEach((i) => i.remove()), 350);
            }),
          );
        }
      }
    }
    if (enter && a.el.isConnected && !a.motion.classList.contains('is-hidden') && !a.el.classList.contains('is-entering')) play(a.motion, enter.replace(/_/g, '-'));
    layout();
    return a;
  }

  function focus(speaker: string | null) {
    for (const a of actors) a.el.classList.toggle('is-dim', a.id !== speaker);
  }

  // ── 연출
  function doActions(a: Actor, list: Action[]) {
    const reduced = reducedMotion();
    for (const act of list) {
      if (act === 'jump') {
        play(a.motion, 'jump');
        sfx.hop();
      } else if (act === 'shake') {
        if (!reduced) play(a.motion, 'shake');
        sfx.wobble();
      } else if (act === 'nod') play(a.motion, 'nod');
      else if (act === 'down') {
        a.pose.classList.remove('is-close');
        a.pose.classList.add('is-down');
        a.el.classList.remove('is-close');
      } else if (act === 'closeup') {
        a.pose.classList.remove('is-down');
        a.pose.classList.add('is-close');
        a.el.classList.add('is-close');
      } else if (act === 'back') {
        a.pose.classList.remove('is-down', 'is-close');
        a.el.classList.remove('is-close');
      } else continue;
      busy(ACTION_MS[act]);
    }
  }

  function showEmotes(a: Actor, list: Emote[]) {
    // 머리 꼭대기: 스탠딩은 머리 끝이 이미지 맨 위라, 이미지 높이(상자 대비 %)로 위치를 잡는다
    const img = a.breath.querySelector('img');
    const ratio = img?.style.height ? parseFloat(img.style.height) / 100 : 0.98;
    list.forEach((kind, i) => {
      const el = h('div', { class: `vn__emote vn__emote--${kind}${i % 2 ? ' is-alt' : ''}` });
      el.innerHTML = emoteSvg(kind);
      el.style.setProperty('--head', `${(ratio * 100).toFixed(1)}%`);
      el.style.animationDelay = `${i * 250}ms`;
      a.motion.append(el);
      later(() => sfx.emote(kind), i * 250);
      setTimeout(() => el.remove(), EMOTE_MS + i * 250 + 50);
    });
  }

  function setPersist(cls: string, on: boolean) {
    stage.classList.toggle(cls, on);
  }

  function doScreen(list: Screen[]) {
    const reduced = reducedMotion();
    for (const fx of list) {
      if (fx === 'shake_small' || fx === 'shake_big') {
        if (!reduced) play(stage, fx === 'shake_big' ? 'shake-big' : 'shake-small');
        sfx.thud(fx === 'shake_big');
      } else if (fx === 'flash_white') {
        play(flash, 'flash');
        sfx.flash();
      } else if (fx === 'clear') Object.values(PERSIST).forEach((c) => setPersist(c!, false));
      else if (PERSIST[fx]) setPersist(PERSIST[fx]!, true);
      busy(SCREEN_MS[fx] ?? 0);
    }
  }

  // ── 대사
  function stopTyping() {
    window.clearTimeout(typing);
    typing = 0;
    // 탭해서 한 번에 띄우면 말소리도 바로 멈춘다
    cutVoice();
    text.textContent = full;
    next.hidden = false;
    scheduleAuto();
  }

  function scheduleAuto() {
    window.clearTimeout(autoTimer);
    if (!auto || waitingChoice || !logPanel.hidden) return;
    autoTimer = window.setTimeout(() => {
      if (auto && !typing && !waitingChoice && logPanel.hidden) advance();
    }, AUTO_BASE_MS + full.length * AUTO_PER_CHAR_MS);
  }

  function showLine(line: ScriptLine) {
    if (!line.screen?.includes('fade_black')) return renderLine(line, false);
    // 암전: 까맣게 → 그동안 장면을 바꾸고 → 다시 밝게
    busy(BLACK_IN_MS + BLACK_OUT_MS);
    text.textContent = '';
    next.hidden = true;
    black.classList.add('is-on');
    later(() => {
      renderLine(line, true);
      black.classList.remove('is-on');
    }, BLACK_IN_MS);
  }

  function renderLine(line: ScriptLine, instant: boolean) {
    if (line.bgm) playBgm(toTrack(line.bgm));
    if (line.bg && line.bg !== bg) {
      if (instant) actors.splice(0).forEach((a) => a.el.remove());
      else clearCast();
      setBg(line.bg, instant);
    }
    if (line.screen) doScreen(line.screen);
    if (line.cg) {
      const url = cgUrl(line.cg);
      cg.replaceChildren(
        url ? h('img', { src: url, alt: line.caption ?? '' }) : h('div', { class: 'vn__cg-empty' }, h('span', {}, '🖼️'), h('strong', {}, 'CG 준비 중'), h('small', {}, `assets/cg/${line.cg}.png`)),
      );
      if (line.caption) cg.append(h('div', { class: 'vn__caption' }, fill(line.caption)));
      cg.hidden = false;
      clearCast();
      box.hidden = true;
      full = fill(line.caption ?? '');
      sfx.grade(4);
      if (line.caption) log.push({ name: '', text: `[CG] ${full}`, kind: 'narration' });
      scheduleAuto();
      return;
    }
    cg.hidden = true;
    box.hidden = false;
    const member = line.s && line.s !== 'me' ? getMember(line.s) : undefined;
    box.classList.toggle('is-narration', !line.s && !line.n);
    box.classList.toggle('is-me', line.s === 'me');
    box.classList.toggle('is-other', !!line.n);
    const enter = line.action?.find((x) => ENTER_ACTIONS.includes(x));
    if (member) {
      const a = showActor(member.id, line.e ?? 'neutral', line.who && line.who !== member.id ? undefined : enter);
      a.spoke = ++spokeClock;
      focus(member.id);
      name.textContent = member.name;
      name.style.setProperty('--member-color', member.color);
    } else {
      focus(null);
      name.textContent = line.s === 'me' ? me : (line.n ?? '');
      name.style.removeProperty('--member-color');
    }
    // 동작·감정 아이콘: who가 있으면 그 부원(무대에 없으면 세운다), 없으면 말하는 부원
    const targetId = line.who ?? member?.id;
    if (targetId && (line.action || line.emote)) {
      let target = actors.find((x) => x.id === targetId);
      if (!target) {
        target = showActor(targetId, targetId === member?.id ? (line.e ?? 'neutral') : 'neutral', enter);
        if (targetId !== member?.id) target.el.classList.add('is-dim');
      }
      if (enter) busy(ACTION_MS[enter]);
      if (line.action) doActions(target, line.action);
      if (line.emote) showEmotes(target, line.emote);
    }
    full = fill(line.t ?? '');
    const speaker = member?.name ?? (line.s === 'me' ? me : (line.n ?? ''));
    log.push({ name: speaker, color: member?.color, text: full, kind: member || line.n ? 'line' : line.s === 'me' ? 'me' : 'narration' });
    text.textContent = '';
    next.hidden = true;
    window.clearTimeout(typing);
    window.clearTimeout(autoTimer);
    typeLine(voiceFor(line, member ? (line.e ?? 'neutral') : undefined));
  }

  /**
   * 한 글자씩 타이핑 + 말소리.
   * - 소리는 (띄어쓰기·문장부호를 뺀) 글자 몇 개에 한 번 (voices.json의 every), 매번 음높이를 살짝 흔든다
   * - 마침표·물음표 뒤엔 잠깐 쉬고, 물음표로 끝나는 대사는 마지막 소리를 올린다
   */
  function typeLine(voice: ReturnType<typeof voiceFor>) {
    const chars = [...full];
    const step = voice?.charMs ?? TYPE_MS;
    const ask = /[?？]\s*$/.test(full);
    let lastVoiced = -1;
    chars.forEach((c, k) => !SILENT.test(c) && (lastVoiced = k));
    let i = 0;
    let voiced = 0;
    const tick = () => {
      const c = chars[i];
      i += 1;
      text.textContent = chars.slice(0, i).join('');
      if (voice && c && !SILENT.test(c)) {
        if (ask && i - 1 === lastVoiced) blip(voice, QUESTION_LIFT);
        else if (voiced % voice.every === 0) blip(voice);
        voiced += 1;
      }
      if (i >= chars.length) return stopTyping();
      // 문장이 끝나는 부호 뒤(부호가 이어지면 마지막 부호 뒤)에서 살짝 쉰다
      const pause = STOP.test(c) && !STOP.test(chars[i]) ? VOICE_PAUSE_MS : 0;
      typing = window.setTimeout(tick, step + pause);
    };
    typing = window.setTimeout(tick, step);
  }

  function showChoices(line: ScriptLine) {
    waitingChoice = true;
    window.clearTimeout(autoTimer);
    box.hidden = false;
    choices.replaceChildren(
      ...(line.choice ?? []).map((c) => {
        const b = h('button', { class: 'vn__choice', type: 'button' }, fill(c.t));
        onTap(b, () => {
          waitingChoice = false;
          choices.hidden = true;
          log.push({ name: '선택', text: fill(c.t), kind: 'choice' });
          if (!opts.replay) opts.onChoice?.(c.xp);
          if (c.xp && !opts.replay) sfx.chime();
          queue.splice(index + 1, 0, ...(c.then ?? []));
          advance();
        });
        return b;
      }),
    );
    choices.hidden = false;
  }

  function advance() {
    if (waitingChoice || !logPanel.hidden) return;
    if (typing) return stopTyping();
    window.clearTimeout(autoTimer);
    // 연출이 끝나지 않았으면 끝난 뒤에 넘긴다 (몇 번을 눌러도 한 번만)
    const wait = fxUntil - performance.now();
    if (wait > 0) {
      if (!pending)
        pending = window.setTimeout(() => {
          pending = 0;
          advance();
        }, wait);
      return;
    }
    // 이 대사에 퇴장 동작이 있으면, 넘기기 전에 먼저 퇴장
    const cur = queue[index];
    const exit = cur?.action?.find((x) => EXIT_ACTIONS.includes(x));
    if (exit && exitedAt !== index) {
      exitedAt = index;
      const who = actors.find((x) => x.id === (cur.who ?? cur.s));
      if (who) {
        leave(who, exit);
        busy(ACTION_MS[exit]);
        return advance();
      }
    }
    index += 1;
    const line = queue[index];
    if (!line) return end(true);
    if (line.choice) return showChoices(line);
    showLine(line);
  }

  function end(completed: boolean) {
    window.clearTimeout(typing);
    cutVoice();
    window.clearTimeout(autoTimer);
    window.clearTimeout(pending);
    timers.forEach((t) => window.clearTimeout(t));
    // 메인 화면으로 돌아가면 main
    playBgm('main');
    root.classList.add('is-closing');
    setTimeout(() => root.remove(), 250);
    opts.onEnd?.(completed);
  }

  // ── 로그
  function openLog() {
    window.clearTimeout(autoTimer);
    const closeLog = h('button', { class: 'vn__btn', type: 'button' }, '닫기');
    const list = h(
      'div',
      { class: 'vn__log-list' },
      ...log.map((e) => {
        const n = h('strong', { class: 'vn__log-name' }, e.name);
        if (e.color) n.style.setProperty('--member-color', e.color);
        return h('div', { class: `vn__log-item is-${e.kind}` }, e.name ? n : null, h('p', {}, e.text));
      }),
    );
    logPanel.replaceChildren(h('div', { class: 'vn__log-head' }, h('strong', {}, '지난 대사'), closeLog), list);
    logPanel.hidden = false;
    requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
    onTap(closeLog, () => {
      logPanel.hidden = true;
      if (!typing) scheduleAuto();
    });
  }

  function setAuto(on: boolean) {
    auto = on;
    autoBtn.setAttribute('aria-pressed', String(on));
    autoBtn.classList.toggle('is-on', on);
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      // 무시
    }
    if (on && !typing) scheduleAuto();
    else window.clearTimeout(autoTimer);
  }

  stage.addEventListener('click', advance);
  onTap(close, () => end(false));
  onTap(logBtn, openLog);
  onTap(autoBtn, () => setAuto(!auto));
  setAuto(auto);
  // 빨리 감기: 다음 선택지·CG(없으면 마지막 줄) 바로 앞까지
  onTap(skip, () => {
    if (waitingChoice) return;
    window.clearTimeout(typing);
    typing = 0;
    cutVoice();
    const stop = queue.findIndex((l, i) => i > index && (l.choice || l.cg));
    const target = (stop === -1 ? queue.length : stop) - 1;
    let lastBg = '';
    let lastBgm: Bgm | undefined;
    window.clearTimeout(pending);
    pending = 0;
    fxUntil = 0;
    while (index + 1 < target) {
      index += 1;
      const l = queue[index];
      if (l.bg) lastBg = l.bg;
      if (l.bgm) lastBgm = l.bgm;
      // 건너뛴 줄의 유지 효과·퇴장은 결과만 반영
      for (const fx of l.screen ?? []) {
        if (fx === 'clear') Object.values(PERSIST).forEach((c) => setPersist(c!, false));
        else if (PERSIST[fx]) setPersist(PERSIST[fx]!, true);
      }
      if (l.action?.some((x) => EXIT_ACTIONS.includes(x))) {
        const gone = actors.find((x) => x.id === (l.who ?? l.s));
        if (gone) exitActor(gone);
      }
      if (l.t) log.push({ name: l.s === 'me' ? me : l.s ? (getMember(l.s)?.name ?? '') : (l.n ?? ''), color: l.s ? getMember(l.s)?.color : undefined, text: fill(l.t), kind: l.s === 'me' ? 'me' : l.s || l.n ? 'line' : 'narration' });
    }
    if (lastBgm) playBgm(toTrack(lastBgm));
    if (lastBg && lastBg !== bg) {
      clearCast();
      setBg(lastBg);
    }
    advance();
  });

  setBg(queue.find((l) => l.bg)?.bg ?? 'classroom', true);
  // 첫 줄에 곡이 없으면 기본 곡. 타이틀 카드 동안은 음악을 잦아들게 해 두고, 카드가 걷히며 첫 줄의 곡으로
  const first = queue.find((l) => !l.choice);
  if (opts.bgm && !first?.bgm) queue[0] = { ...queue[0], bgm: opts.bgm };
  if (opts.card) {
    playBgm(null);
    playTitleCard(root, opts.card, advance);
  } else advance();
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}
