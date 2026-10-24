import { getMember } from '../data/members';
import type { ScriptLine } from '../data/narrative';
import { getPortraits } from '../data/portraits';
import { h, memberFace, onTap } from './dom';
import { sfx } from './sfx';

/** 이벤트 CG: assets/cg/<부원 id>.png (아직 없으면 빈 칸으로 보여 준다) */
const cgFiles = import.meta.glob('/assets/cg/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const CG = new Map<string, string>();
for (const [file, url] of Object.entries(cgFiles)) {
  const m = /\/assets\/cg\/([^/]+)\.\w+$/.exec(file);
  if (m) CG.set(m[1], url);
}
export const cgUrl = (id: string) => CG.get(id);

const TYPE_MS = 28;

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

/**
 * 비주얼 노벨 화면: 배경 + 말하는 부원의 표정 + 대사창 + 선택지.
 * 탭하면 글자가 다 나오고, 한 번 더 탭하면 다음 줄.
 */
export function playScript(opts: ScriptOptions): void {
  document.querySelector('.vn')?.remove();
  const queue: ScriptLine[] = [...opts.lines];
  let index = -1;
  let typing = 0;
  let full = '';
  let waitingChoice = false;
  let bg = 'classroom';

  const bgEl = h('div', { class: 'vn__bg' });
  const actor = h('div', { class: 'vn__actor' });
  const cg = h('div', { class: 'vn__cg', hidden: true });
  const name = h('div', { class: 'vn__name' });
  const text = h('p', { class: 'vn__text' });
  const next = h('span', { class: 'vn__next', 'aria-hidden': 'true' }, '▼');
  const box = h('div', { class: 'vn__box' }, name, text, next);
  const choices = h('div', { class: 'vn__choices', hidden: true });
  const skip = h('button', { class: 'vn__btn', type: 'button' }, '빨리 감기 ▶▶');
  const close = h('button', { class: 'vn__btn', type: 'button', 'aria-label': '닫기' }, '✕');
  const stage = h('div', { class: 'vn__stage', role: 'button', 'aria-label': '다음 대사' }, bgEl, actor, cg, box);
  const root = h(
    'div',
    { class: 'vn', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
    stage,
    choices,
    h('div', { class: 'vn__top' }, h('div', { class: 'vn__title' }, opts.title), h('div', { class: 'vn__tools' }, skip, close)),
  );
  document.body.append(root);

  function setBg(id: string) {
    bg = id;
    bgEl.className = `vn__bg vn__bg--${bg}`;
  }
  setBg(queue.find((l) => l.bg)?.bg ?? 'classroom');

  function stopTyping() {
    window.clearInterval(typing);
    typing = 0;
    text.textContent = full;
    next.hidden = false;
  }

  function showLine(line: ScriptLine) {
    if (line.bg) setBg(line.bg);
    if (line.cg) {
      const url = cgUrl(line.cg);
      cg.replaceChildren(
        url ? h('img', { src: url, alt: line.caption ?? '' }) : h('div', { class: 'vn__cg-empty' }, h('span', {}, '🖼️'), h('strong', {}, 'CG 준비 중'), h('small', {}, `assets/cg/${line.cg}.png`)),
      );
      if (line.caption) cg.append(h('div', { class: 'vn__caption' }, line.caption));
      cg.hidden = false;
      actor.replaceChildren();
      box.hidden = true;
      sfx.grade(4);
      return;
    }
    cg.hidden = true;
    box.hidden = false;
    const member = line.s ? getMember(line.s) : undefined;
    box.classList.toggle('is-narration', !line.s);
    box.classList.toggle('is-me', line.s === 'me');
    if (member) {
      name.textContent = member.name;
      name.style.setProperty('--member-color', member.color);
      const prev = actor.dataset.who;
      const body = getPortraits(member.id)?.full;
      actor.replaceChildren(memberFace(member, line.e ?? 'neutral', 'lg'));
      if (body) actor.style.setProperty('--full', `url("${body}")`);
      actor.dataset.who = member.id;
      actor.classList.toggle('is-enter', prev !== member.id);
    } else {
      name.textContent = line.s === 'me' ? '나' : '';
    }
    full = line.t ?? '';
    text.textContent = '';
    next.hidden = true;
    let i = 0;
    window.clearInterval(typing);
    typing = window.setInterval(() => {
      i += 1;
      text.textContent = full.slice(0, i);
      if (i >= full.length) stopTyping();
    }, TYPE_MS);
  }

  function showChoices(line: ScriptLine) {
    waitingChoice = true;
    box.hidden = false;
    choices.replaceChildren(
      ...(line.choice ?? []).map((c) => {
        const b = h('button', { class: 'vn__choice', type: 'button' }, c.t);
        onTap(b, () => {
          waitingChoice = false;
          choices.hidden = true;
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
    if (waitingChoice) return;
    if (typing) return stopTyping();
    index += 1;
    const line = queue[index];
    if (!line) return end(true);
    if (line.choice) return showChoices(line);
    showLine(line);
  }

  function end(completed: boolean) {
    window.clearInterval(typing);
    root.classList.add('is-closing');
    setTimeout(() => root.remove(), 250);
    opts.onEnd?.(completed);
  }

  stage.addEventListener('click', advance);
  onTap(close, () => end(false));
  // 빨리 감기: 다음 선택지(없으면 마지막 줄)까지
  onTap(skip, () => {
    if (waitingChoice) return;
    window.clearInterval(typing);
    typing = 0;
    const stop = queue.findIndex((l, i) => i > index && (l.choice || l.cg));
    const target = (stop === -1 ? queue.length : stop) - 1;
    // 건너뛴 줄의 배경 바뀜은 반영하고, 선택지 바로 앞 줄을 보여 준다
    while (index + 1 < target) {
      index += 1;
      if (queue[index].bg) setBg(queue[index].bg!);
    }
    advance();
  });

  advance();
}
