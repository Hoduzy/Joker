import { getMember } from '../data/members';
import type { ScriptLine } from '../data/narrative';
import { standUrl, type Expression } from '../data/portraits';
import { h, onTap } from './dom';
import { sfx } from './sfx';

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

const TYPE_MS = 32;
/** 오토 모드: 글자가 다 나온 뒤 이만큼 + 글자당 시간 기다렸다 넘긴다 */
const AUTO_BASE_MS = 1100;
const AUTO_PER_CHAR_MS = 45;
const AUTO_KEY = 'simya-bangsongbu/vn-auto';

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
}

type Side = 'left' | 'right';

interface Actor {
  id: string;
  el: HTMLElement;
  expr: Expression;
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
 */
export function playScript(opts: ScriptOptions): void {
  document.querySelector('.vn')?.remove();
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
  const stage = h('div', { class: 'vn__stage', role: 'button', 'aria-label': '다음 대사' }, bgLayer, cast, cg, box);
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
  function standImg(id: string, expr: Expression): HTMLImageElement {
    const { url, cropped } = standUrl(id, expr);
    const img = h('img', { class: `vn__stand${cropped ? '' : ' is-full'}`, src: url ?? '', alt: '', draggable: 'false' });
    return img;
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

  function clearCast() {
    [...actors].forEach(exitActor);
  }

  /** 말하는 부원을 무대에 세우고(없으면 등장) 표정을 맞춘다 */
  function showActor(id: string, expr: Expression): Actor {
    let a = actors.find((x) => x.id === id);
    if (!a) {
      if (actors.length >= 2) exitActor([...actors].sort((x, y) => x.spoke - y.spoke)[0]);
      const side: Side = actors.length === 0 ? 'left' : actors[0].side === 'left' ? 'right' : 'left';
      const member = getMember(id);
      const el = h('div', { class: 'vn__actor is-entering' }, standImg(id, expr));
      el.style.setProperty('--member-color', member?.color ?? '#fff');
      cast.append(el);
      a = { id, el, expr, side, spoke: 0 };
      actors.push(a);
      requestAnimationFrame(() => requestAnimationFrame(() => a!.el.classList.remove('is-entering')));
    } else if (a.expr !== expr) {
      // 표정 바꾸기: 새 이미지를 위에 올려 서서히 나타나게
      const prev = a.el.querySelector('img:last-child');
      const nextImg = standImg(id, expr);
      if (prev && (prev as HTMLImageElement).src === nextImg.src) {
        a.expr = expr;
      } else {
        nextImg.classList.add('is-fading');
        a.el.append(nextImg);
        requestAnimationFrame(() => requestAnimationFrame(() => nextImg.classList.remove('is-fading')));
        setTimeout(() => [...a!.el.querySelectorAll('img')].slice(0, -1).forEach((i) => i.remove()), 400);
        a.expr = expr;
      }
    }
    layout();
    return a;
  }

  function focus(speaker: string | null) {
    for (const a of actors) a.el.classList.toggle('is-dim', a.id !== speaker);
  }

  // ── 대사
  function stopTyping() {
    window.clearInterval(typing);
    typing = 0;
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
    if (line.bg && line.bg !== bg) {
      clearCast();
      setBg(line.bg);
    }
    if (line.cg) {
      const url = cgUrl(line.cg);
      cg.replaceChildren(
        url ? h('img', { src: url, alt: line.caption ?? '' }) : h('div', { class: 'vn__cg-empty' }, h('span', {}, '🖼️'), h('strong', {}, 'CG 준비 중'), h('small', {}, `assets/cg/${line.cg}.png`)),
      );
      if (line.caption) cg.append(h('div', { class: 'vn__caption' }, line.caption));
      cg.hidden = false;
      clearCast();
      box.hidden = true;
      full = line.caption ?? '';
      sfx.grade(4);
      if (line.caption) log.push({ name: '', text: `[CG] ${line.caption}`, kind: 'narration' });
      scheduleAuto();
      return;
    }
    cg.hidden = true;
    box.hidden = false;
    const member = line.s && line.s !== 'me' ? getMember(line.s) : undefined;
    box.classList.toggle('is-narration', !line.s);
    box.classList.toggle('is-me', line.s === 'me');
    if (member) {
      const a = showActor(member.id, line.e ?? 'neutral');
      a.spoke = ++spokeClock;
      focus(member.id);
      name.textContent = member.name;
      name.style.setProperty('--member-color', member.color);
    } else {
      focus(null);
      name.textContent = line.s === 'me' ? '나' : '';
      name.style.removeProperty('--member-color');
    }
    full = line.t ?? '';
    log.push({ name: member?.name ?? (line.s === 'me' ? '나' : ''), color: member?.color, text: full, kind: member ? 'line' : line.s === 'me' ? 'me' : 'narration' });
    text.textContent = '';
    next.hidden = true;
    let i = 0;
    window.clearInterval(typing);
    window.clearTimeout(autoTimer);
    typing = window.setInterval(() => {
      i += 1;
      text.textContent = full.slice(0, i);
      if (i >= full.length) stopTyping();
    }, TYPE_MS);
  }

  function showChoices(line: ScriptLine) {
    waitingChoice = true;
    window.clearTimeout(autoTimer);
    box.hidden = false;
    choices.replaceChildren(
      ...(line.choice ?? []).map((c) => {
        const b = h('button', { class: 'vn__choice', type: 'button' }, c.t);
        onTap(b, () => {
          waitingChoice = false;
          choices.hidden = true;
          log.push({ name: '선택', text: c.t, kind: 'choice' });
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
    index += 1;
    const line = queue[index];
    if (!line) return end(true);
    if (line.choice) return showChoices(line);
    showLine(line);
  }

  function end(completed: boolean) {
    window.clearInterval(typing);
    window.clearTimeout(autoTimer);
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
    window.clearInterval(typing);
    typing = 0;
    const stop = queue.findIndex((l, i) => i > index && (l.choice || l.cg));
    const target = (stop === -1 ? queue.length : stop) - 1;
    let lastBg = '';
    while (index + 1 < target) {
      index += 1;
      const l = queue[index];
      if (l.bg) lastBg = l.bg;
      if (l.t) log.push({ name: l.s === 'me' ? '나' : l.s ? (getMember(l.s)?.name ?? '') : '', color: l.s ? getMember(l.s)?.color : undefined, text: l.t, kind: l.s === 'me' ? 'me' : l.s ? 'line' : 'narration' });
    }
    if (lastBg && lastBg !== bg) {
      clearCast();
      setBg(lastBg);
    }
    advance();
  });

  setBg(queue.find((l) => l.bg)?.bg ?? 'classroom', true);
  advance();
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}
