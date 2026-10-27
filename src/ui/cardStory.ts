import { cardBondLevel, cardBondProgress, cardEpisodeOpen, cardTalksLeft } from '../core/cardBond';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getCard, type CardDef } from '../data/cards';
import { getCardEpisode, getCardStory } from '../data/cardStories';
import { dayKey } from '../data/flavor';
import { getMember } from '../data/members';
import { h, memberFace, onTap } from './dom';
import { openModal } from './modal';
import { sfx } from './sfx';
import { ensureName } from './storyView';
import { toast } from './toast';
import { playScript } from './vn';

/**
 * 카드 전용 스토리 (card_stories.json) 화면들:
 * - 카드 상세의 호감도 줄 (레벨·게이지, 교감하기, 전용 스토리 버튼)
 * - 전용 스토리 목록 (해금 조건, 다시보기)
 * - 재생: 그 카드의 의상으로, 선택지 호감도는 카드 호감도로
 */

/** 카드 상세에 넣는 호감도 줄. 전용 스토리가 없는 카드면 null */
export function cardBondPanel(game: Game, card: CardDef, onPlay: () => void = () => {}): HTMLElement | null {
  const story = getCardStory(card.id);
  if (!story) return null;
  const el = h('div', { class: 'cbond' });
  const render = () => {
    const xp = game.state.cardBond[card.id]?.xp ?? 0;
    const level = cardBondLevel(game.state, card.id);
    const prog = cardBondProgress(xp);
    const fill = h('div', { class: 'progress__fill cbond__fill' });
    fill.style.width = prog ? `${(prog.current / prog.need) * 100}%` : '100%';
    const left = cardTalksLeft(game.state, card.id, dayKey(new Date()));
    const talk = h('button', { class: 'btn btn--ghost btn--small', type: 'button', disabled: left <= 0 }, `💬 교감하기 ${left}/${BALANCE.cardBond.talksPerDay}`);
    onTap(talk, () => {
      const line = game.talkCard(card.id);
      if (!line) return;
      sfx.chime();
      toast(`“${line.t}” 호감도 +${BALANCE.cardBond.talkXp}`, memberFace(getMember(card.member)!, line.e, 'sm', card.outfit));
      render();
    });
    const seen = story.episodes.filter((e) => game.state.story.seen.includes(e.key)).length;
    const fresh = story.episodes.some((e) => cardEpisodeOpen(game.state, card.id, e) && !game.state.story.seen.includes(e.key));
    const open = h('button', { class: `btn btn--primary btn--small cbond__story${fresh ? ' is-new' : ''}`, type: 'button' }, '📖 전용 스토리', fresh ? h('span', { class: 'badge' }, 'N') : null);
    onTap(open, () => openCardStories(game, card.id, onPlay));
    const next = story.episodes.find((e) => e.level > level);
    el.replaceChildren(
      h(
        'div',
        { class: 'cbond__head' },
        h('span', { class: 'cbond__heart', 'aria-hidden': 'true' }, '💜'),
        h('strong', {}, `카드 호감도 Lv.${level}`),
        h('small', {}, prog ? `${Math.floor(prog.current)} / ${prog.need}` : 'MAX'),
        h('small', { class: 'cbond__seen' }, `스토리 ${seen}/${story.episodes.length}`),
      ),
      h('div', { class: 'progress cbond__bar' }, fill),
      h('p', { class: 'cbond__hint' }, next ? `Lv.${next.level}에 ${next.no}화 「${next.title}」 해금 · 배치·교감·돌파로 올라요 · 레벨마다 능력치 +${Math.round(BALANCE.cardBond.statPerLevel * 100)}%` : '전용 스토리를 모두 열었어요'),
      h('div', { class: 'cbond__actions' }, talk, open),
    );
  };
  render();
  return el;
}

/** 전용 스토리 목록 */
export function openCardStories(game: Game, cardId: string, onPlay: () => void = () => {}): void {
  const story = getCardStory(cardId);
  const card = getCard(cardId);
  if (!story || !card) return;
  const level = cardBondLevel(game.state, cardId);
  const rows = story.episodes.map((ep) => {
    const seen = game.state.story.seen.includes(ep.key);
    const open = cardEpisodeOpen(game.state, cardId, ep);
    const row = h(
      'button',
      { class: `episode${seen ? '' : open ? ' is-new' : ' is-locked'}`, type: 'button', disabled: !open },
      h('span', { class: 'episode__no' }, `${ep.no}화`),
      h('strong', {}, open ? ep.title : '???'),
      h('span', { class: 'chapter__state' }, seen ? '다시보기 ↺' : open ? 'NEW ▶' : `🔒 호감도 Lv.${ep.level}`),
    );
    if (open)
      onTap(row, () => {
        document.getElementById('modal')?.remove();
        onPlay();
        playCardEpisode(game, ep.key);
      });
    return row;
  });
  openModal({
    title: `📖 ${story.title} · 전용 스토리`,
    body: h(
      'div',
      { class: 'cstory' },
      h('p', { class: 'cstory__note' }, story.note),
      h('p', { class: 'cstory__level' }, `지금 카드 호감도 Lv.${level} — 1화 Lv.${story.episodes[0].level}${story.episodes.slice(1).map((e) => ` · ${e.no}화 Lv.${e.level}`).join('')}`),
      h('div', { class: 'episodes' }, ...rows),
    ),
    confirmLabel: '닫기',
    confirmGhost: true,
  });
}

/** 전용 스토리 한 화 재생 (해금된 화만). 처음 끝까지 보면 본 기록 */
export function playCardEpisode(game: Game, key: string): void {
  const found = getCardEpisode(key);
  if (!found) return;
  const { story, episode } = found;
  const card = getCard(story.cardId);
  if (!card || !cardEpisodeOpen(game.state, card.id, episode)) return;
  ensureName(game, () => {
    const replay = game.state.story.seen.includes(key);
    playScript({
      title: `${story.title} · ${episode.no}화 ${episode.title}`,
      lines: episode.lines,
      replay,
      outfits: card.outfit ? { [card.member]: card.outfit } : undefined,
      card: { overline: `CARD STORY · EPISODE ${episode.no}`, title: episode.title, frequency: episode.frequency, short: replay },
      name: game.state.story.name,
      bgm: 'romance',
      onChoice: (xp) => !replay && game.applyCardChoiceXp(card.id, xp),
      onEnd: (done) => done && !replay && game.markStorySeen(key),
    });
  });
}
