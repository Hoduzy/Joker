import type { Game } from '../core/game';
import { chapterOpen, endingKey, episodeAvailable, nextEpisode, pickEnding, storyFinished } from '../core/story';
import { getMember } from '../data/members';
import { getCard } from '../data/cards';
import { EVENTS, getEventEpisode, type EventDef, type EventEpisode } from '../data/events';
import { CHAPTERS, ENDINGS, EPISODES, getEnding, getEpisode, type Episode } from '../data/narrative';
import { formatNumber } from '../utils/format';
import { h, onTap } from './dom';
import { openModal } from './modal';
import { playScript } from './vn';

/** 주인공 이름 입력. 이미 있으면 바로 then */
export function ensureName(game: Game, then: () => void, force = false): void {
  if (game.state.story.name && !force) return then();
  const input = h('input', {
    class: 'name-input',
    type: 'text',
    maxlength: 8,
    placeholder: '이름 (최대 8자)',
    value: game.state.story.name,
    autocomplete: 'off',
    enterkeyhint: 'done',
  }) as HTMLInputElement;
  const body = h(
    'div',
    { class: 'name-prompt' },
    h('p', {}, '해솔고 1학년, 방송부의 새 부원. 이야기 속에서 불릴 이름을 정해 주세요.'),
    input,
    h('small', {}, '나중에 설정에서 바꿀 수 있어요.'),
  );
  const save = () => {
    game.setPlayerName(input.value.trim() || '나');
    then();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('modal')?.remove();
      save();
    }
  });
  openModal({ title: '주인공 이름', body, confirmLabel: '정했어요', onConfirm: save });
  setTimeout(() => input.focus(), 50);
}

/** 화 하나 재생. 마지막 화를 처음 다 보면 이어서 엔딩 */
export function playEpisode(game: Game, key: string): void {
  const ep = getEpisode(key);
  if (!ep || !episodeAvailable(game.state, ep)) return;
  ensureName(game, () => {
    const replay = game.state.story.seen.includes(key);
    const chapter = CHAPTERS.find((c) => c.id === ep.chapter)!;
    playScript({
      title: `CH.${ep.chapter} ${chapter.title} · ${ep.no}화 ${ep.title}`,
      lines: ep.lines,
      replay,
      card: { overline: `CHAPTER ${ep.chapter} · EPISODE ${ep.no}`, title: ep.title, frequency: ep.frequency, unstable: ep.unstable, short: replay },
      name: game.state.story.name,
      onChoice: (xp) => game.applyChoiceXp(xp),
      onEnd: (done) => {
        if (!done || replay) return;
        game.markStorySeen(key);
        const last = EPISODES[EPISODES.length - 1];
        if (key === last.key) {
          const ending = pickEnding(game.state);
          if (ending) setTimeout(() => playEnding(game, ending.id), 600);
        }
      },
    });
  });
}

/**
 * 이벤트 스토리 화: 이벤트 중에는 앞 화를 보면 다음 화가 열리고, 끝난 뒤에는 본 화만 다시 볼 수 있다
 */
export function eventEpisodeOpen(game: Game, ev: EventDef, ep: EventEpisode): boolean {
  const seen = game.state.story.seen;
  if (seen.includes(ep.key)) return true;
  if (game.event()?.id !== ev.id) return false;
  return ep.no === 1 || seen.includes(`ev:${ev.id}:${ep.no - 1}`);
}

/** 이벤트 스토리 재생. 이벤트 U 카드의 부원은 그 의상(할로윈 등)으로 나온다 */
export function playEventEpisode(game: Game, key: string): void {
  const found = getEventEpisode(key);
  if (!found || !eventEpisodeOpen(game, found.event, found.episode)) return;
  const { event, episode } = found;
  const outfits: Record<string, string> = {};
  for (const id of event.cards) {
    const c = getCard(id);
    if (c?.outfit) outfits[c.member] = c.outfit;
  }
  ensureName(game, () => {
    const replay = game.state.story.seen.includes(key);
    playScript({
      title: `${event.name} · ${episode.no}화 ${episode.title}`,
      lines: episode.lines,
      replay,
      outfits,
      card: { overline: `EVENT · EPISODE ${episode.no}`, title: episode.title, frequency: episode.frequency, unstable: episode.unstable, short: replay },
      name: game.state.story.name,
      onEnd: (done) => done && !replay && game.markStorySeen(key),
    });
  });
}

/** 메인 스토리 목록 아래: 진행 중이거나 본 적 있는 이벤트 스토리 */
function eventStoryBlocks(game: Game): HTMLElement[] {
  const live = game.event();
  return EVENTS.filter((ev) => ev.story.length && (live?.id === ev.id || ev.story.some((ep) => game.state.story.seen.includes(ep.key)))).map((ev) =>
    h(
      'section',
      { class: 'chapter-block chapter-block--event' },
      h(
        'div',
        { class: 'chapter-head' },
        h('span', { class: 'chapter__no' }, 'EVENT'),
        h('div', { class: 'chapter__text' }, h('strong', {}, ev.name), h('small', {}, live?.id === ev.id ? '이벤트 기간 한정 · 본 화는 끝난 뒤에도 다시 볼 수 있어요' : '지난 이벤트 · 다시보기')),
        h('span', { class: 'chapter__state' }, `${ev.story.filter((ep) => game.state.story.seen.includes(ep.key)).length} / ${ev.story.length}`),
      ),
      h('div', { class: 'episodes' }, ...ev.story.map((ep) => eventEpisodeRow(game, ev, ep))),
    ),
  );
}

export function eventEpisodeRow(game: Game, ev: EventDef, ep: EventEpisode): HTMLElement {
  const seen = game.state.story.seen.includes(ep.key);
  const open = eventEpisodeOpen(game, ev, ep);
  const row = h(
    'button',
    { class: `episode${seen ? '' : open ? ' is-new' : ' is-locked'}`, type: 'button', disabled: !open },
    h('span', { class: 'episode__no' }, `${ep.no}화`),
    h('strong', {}, open ? ep.title : '???'),
    h('span', { class: 'chapter__state' }, seen ? '다시보기 ↺' : open ? 'NEW ▶' : game.event()?.id === ev.id ? '🔒 앞 화를 먼저' : '🔒 이벤트 종료'),
  );
  if (open) onTap(row, () => playEventEpisode(game, ep.key));
  return row;
}

export function playEnding(game: Game, id: string): void {
  const ending = getEnding(id);
  if (!ending) return;
  const key = endingKey(id);
  const replay = game.state.story.seen.includes(key);
  const who = id === 'true' ? '진엔딩' : `${getMember(id)?.name} 엔딩`;
  playScript({
    title: `EPILOGUE · ${who} · ${ending.title}`,
    lines: ending.lines,
    replay,
    card: { overline: `EPILOGUE · ${who}`, title: ending.title, frequency: ending.frequency, short: replay },
    name: game.state.story.name,
    onChoice: (xp) => game.applyChoiceXp(xp),
    onEnd: (done) => done && !replay && game.markStorySeen(key),
  });
}

function episodeState(game: Game, ep: Episode): { label: string; cls: string; open: boolean } {
  const seen = game.state.story.seen.includes(ep.key);
  if (seen) return { label: '다시보기 ↺', cls: '', open: true };
  if (episodeAvailable(game.state, ep)) return { label: 'NEW ▶', cls: ' is-new', open: true };
  const chapter = CHAPTERS.find((c) => c.id === ep.chapter)!;
  if (!chapterOpen(game.state, chapter)) return { label: `🔒 누적 청취자 ${formatNumber(chapter.unlock)}`, cls: ' is-locked', open: false };
  return { label: '🔒 앞 화를 먼저', cls: ' is-locked', open: false };
}

/** 펼쳐 둔 챕터 (지금 보는 챕터는 항상 펼친다) */
const expanded = new Set<number>();

/** 메인 스토리 목록: 챕터마다 다섯 화, 끝까지 보면 엔딩. rerender는 접기/펼치기 후 다시 그리기 */
export function renderStoryList(game: Game, rerender: () => void = () => {}): HTMLElement {
  const next = nextEpisode(game.state);
  const items: HTMLElement[] = [
    h(
      'div',
      { class: 'chapters__intro' },
      h('strong', {}, '“이 방송이, 들리나요?”'),
      h('p', {}, '폐부 직전의 해솔고 방송부와, 옥상 송신탑에서만 들리는 소녀의 이야기. 누적 청취자가 늘어날 때마다 다음 챕터가 열려요.'),
    ),
  ];
  for (const c of CHAPTERS) {
    const open = chapterOpen(game.state, c);
    const seenCount = c.episodes.filter((e) => game.state.story.seen.includes(e.key)).length;
    const current = next?.chapter === c.id;
    const fill = h('div', { class: 'progress__fill' });
    fill.style.width = `${Math.min(100, (game.state.totalListeners / c.unlock) * 100)}%`;
    const isOpen = open && (current || expanded.has(c.id));
    const head = h(
      'button',
      { class: 'chapter-head', type: 'button', 'aria-expanded': String(isOpen), disabled: !open || current },
      h('span', { class: 'chapter__no' }, `CH.${c.id}`),
      h('div', { class: 'chapter__text' }, h('strong', {}, open || seenCount ? c.title : '???'), h('small', {}, open ? c.summary : `누적 청취자 ${formatNumber(c.unlock)}명에 열려요`)),
      h('span', { class: 'chapter__state' }, `${seenCount} / ${c.episodes.length}${open && !current ? (isOpen ? ' ▴' : ' ▾') : ''}`),
    );
    if (open && !current)
      onTap(head, () => {
        if (expanded.has(c.id)) expanded.delete(c.id);
        else expanded.add(c.id);
        rerender();
      });
    const eps = c.episodes.map((ep) => {
      const st = episodeState(game, ep);
      const row = h(
        'button',
        { class: `episode${st.cls}`, type: 'button', disabled: !st.open },
        h('span', { class: 'episode__no' }, `${ep.no}화`),
        h('strong', {}, st.open ? ep.title : '???'),
        h('span', { class: 'chapter__state' }, st.label),
      );
      if (st.open) onTap(row, () => playEpisode(game, ep.key));
      return row;
    });
    items.push(
      h(
        'section',
        { class: `chapter-block${open ? '' : ' is-locked'}${current ? ' is-current' : ''}` },
        head,
        isOpen ? h('div', { class: 'episodes' }, ...eps) : !open ? h('div', { class: 'progress chapter-block__bar' }, fill) : null,
      ),
    );
  }
  // 엔딩: 이야기를 끝까지 보면 열린다
  if (storyFinished(game.state)) {
    const reached = ENDINGS.filter((e) => game.state.story.seen.includes(endingKey(e.id)));
    const pick = pickEnding(game.state);
    const rows = reached.map((e) => {
      const b = h('button', { class: 'episode', type: 'button' }, h('span', { class: 'episode__no' }, 'END'), h('strong', {}, `${e.id === 'true' ? '진엔딩' : getMember(e.id)?.name} · ${e.title}`), h('span', { class: 'chapter__state' }, '다시보기 ↺'));
      onTap(b, () => playEnding(game, e.id));
      return b;
    });
    if (pick && !reached.some((e) => e.id === pick.id)) {
      const b = h('button', { class: 'episode is-new', type: 'button' }, h('span', { class: 'episode__no' }, 'END'), h('strong', {}, '새 에필로그'), h('span', { class: 'chapter__state' }, 'NEW ▶'));
      onTap(b, () => playEnding(game, pick.id));
      rows.unshift(b);
    }
    items.push(
      h(
        'section',
        { class: 'chapter-block' },
        h('div', { class: 'chapter-head' }, h('span', { class: 'chapter__no' }, 'EPI'), h('div', { class: 'chapter__text' }, h('strong', {}, '에필로그'), h('small', {}, `호감도가 가장 높은 부원의 엔딩, 모두 호감도 ${getEnding('true')?.minLevel ?? 6} 이상이면 진엔딩`)), h('span', { class: 'chapter__state' }, `${reached.length} / ${ENDINGS.length}`)),
        h('div', { class: 'episodes' }, ...rows),
      ),
    );
  }
  items.push(...eventStoryBlocks(game));
  return h('div', { class: 'chapters' }, ...items);
}

/** 앨범용: 본 화를 챕터별로, 본 엔딩 */
export function renderStoryAlbum(game: Game): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const c of CHAPTERS) {
    const seen = c.episodes.filter((e) => game.state.story.seen.includes(e.key));
    for (const ep of seen) {
      const b = h('button', { class: 'album-row', type: 'button' }, h('span', { class: 'chapter__no' }, `${c.id}-${ep.no}`), h('span', {}, ep.title), h('span', { class: 'chapter__state' }, '↺'));
      onTap(b, () => playEpisode(game, ep.key));
      rows.push(b);
    }
  }
  for (const e of ENDINGS.filter((x) => game.state.story.seen.includes(endingKey(x.id)))) {
    const b = h('button', { class: 'album-row', type: 'button' }, h('span', { class: 'chapter__no' }, 'END'), h('span', {}, e.title), h('span', { class: 'chapter__state' }, '↺'));
    onTap(b, () => playEnding(game, e.id));
    rows.push(b);
  }
  return rows;
}
