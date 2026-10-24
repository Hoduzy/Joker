import { bondLevel, bondProgress, bondStatMult, giftXp, pendingEvents } from '../core/bond';
import type { Game } from '../core/game';
import { BALANCE } from '../data/balance';
import { getMember, MEMBERS, type MemberDef } from '../data/members';
import { CHAPTERS, chapterUnlock, NARRATIVE } from '../data/narrative';
import { getPortraits } from '../data/portraits';
import { formatNumber } from '../utils/format';
import type { Component } from './component';
import { h, memberFace, onTap } from './dom';
import { popNumber, sparkle } from './fx';
import { openPhone } from './phone';
import { sfx } from './sfx';
import { toast } from './toast';
import { cgUrl, playScript } from './vn';

type View = 'members' | 'story' | 'album';

const GIFT_THANKS: Record<string, string> = {
  snack: '오, 간식! 방송 끝나고 같이 먹자.',
  drink: '따뜻하다… 고마워. 손이 좀 시렸거든.',
  goods: '방송부 굿즈! 소중히 할게.',
};

/** 아직 안 본 열린 챕터 */
export function newChapters(game: Game): number[] {
  return CHAPTERS.filter((c) => isChapterOpen(game, c.id) && !game.state.story.seen.includes(c.id)).map((c) => c.id);
}

export function isChapterOpen(game: Game, id: number): boolean {
  return game.state.milestonesReached >= chapterUnlock(id);
}

/** 부원·스토리에 새로 볼 게 있는지 (탭 점) */
export function hasNewStory(game: Game): boolean {
  return newChapters(game).length > 0 || MEMBERS.some((m) => pendingEvents(game.state, m.id).length > 0);
}

export function playChapter(game: Game, id: number): void {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) return;
  const replay = game.state.story.seen.includes(id);
  playScript({
    title: `CHAPTER ${c.id} · ${c.title}`,
    lines: c.lines,
    replay,
    onChoice: (xp) => game.applyChoiceXp(xp),
    onEnd: (done) => done && !replay && game.markChapterSeen(id),
  });
}

export function playEvent(game: Game, memberId: string, level: number): void {
  const ev = NARRATIVE.events[memberId]?.find((e) => e.level === level);
  if (!ev) return;
  const replay = game.state.bond[memberId].seenEvents.includes(level);
  playScript({
    title: `${getMember(memberId)?.name} · ${ev.title}`,
    lines: ev.lines,
    replay,
    onChoice: (xp) => game.applyChoiceXp(xp),
    onEnd: (done) => done && !replay && game.markEventSeen(memberId, level),
  });
}

/** 부원 탭: 부원 상세(대화·선물·대사·이벤트), 메인 스토리, 추억 앨범 */
export function createMembers(game: Game): Component {
  let view: View = 'members';
  let selected = MEMBERS[0].id;

  const subtabs = h('div', { class: 'subtabs', role: 'tablist' });
  const list = h('div', { class: 'mlist' });
  const detail = h('div', { class: 'mdetail' });
  const story = h('div', { class: 'chapters' });
  const album = h('div', { class: 'album' });
  const body = h('div', { class: 'members__body' });
  const el = h('section', { class: 'members' }, subtabs, body);

  const views: Record<View, string> = { members: '부원', story: '메인 스토리', album: '추억 앨범' };

  function renderTabs() {
    subtabs.replaceChildren(
      ...(Object.keys(views) as View[]).map((v) => {
        const dot = v === 'story' ? newChapters(game).length > 0 : v === 'members' ? MEMBERS.some((m) => pendingEvents(game.state, m.id).length > 0) : false;
        const b = h('button', { class: `subtab${view === v ? ' is-active' : ''}`, type: 'button', role: 'tab' }, views[v], dot ? h('i', { class: 'tabs__dot' }) : null);
        onTap(b, () => {
          view = v;
          render();
        });
        return b;
      }),
    );
  }

  // ── 부원 목록 + 상세
  function renderList() {
    list.replaceChildren(
      ...MEMBERS.map((m) => {
        const b = game.state.bond[m.id];
        const lv = bondLevel(b.xp);
        const p = bondProgress(b.xp);
        const fill = h('div', { class: 'heart-bar__fill' });
        fill.style.width = `${p ? (p.current / p.need) * 100 : 100}%`;
        const btn = h(
          'button',
          { class: `mrow${selected === m.id ? ' is-active' : ''}`, type: 'button' },
          memberFace(m, lv >= 5 ? 'smile' : 'neutral', 'sm'),
          h('div', { class: 'mrow__text' }, h('strong', {}, m.name), h('span', { class: 'mrow__lv' }, `💗 Lv.${lv}`), h('div', { class: 'heart-bar' }, fill)),
          pendingEvents(game.state, m.id).length ? h('span', { class: 'badge badge--new' }, 'EVENT') : null,
        );
        btn.style.setProperty('--member-color', m.color);
        onTap(btn, () => {
          selected = m.id;
          render();
        });
        return btn;
      }),
    );
  }

  const bubble = h('div', { class: 'mstage__bubble', hidden: true });
  let bubbleTimer = 0;
  function say(m: MemberDef, e: Parameters<typeof memberFace>[1], t: string) {
    bubble.replaceChildren(memberFace(m, e, 'sm'), h('p', {}, t));
    bubble.hidden = false;
    bubble.classList.remove('is-in');
    void bubble.offsetWidth;
    bubble.classList.add('is-in');
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => (bubble.hidden = true), 5000);
  }

  function renderDetail() {
    const m = getMember(selected)!;
    const b = game.state.bond[m.id];
    const lv = bondLevel(b.xp);
    const p = bondProgress(b.xp);
    const info = NARRATIVE.bond[m.id];

    // 전신 이미지: 탭하면 대화
    const full = getPortraits(m.id)?.full;
    const figure = h('button', { class: 'mstage__figure', type: 'button', 'aria-label': `${m.name}에게 말 걸기`, 'data-sfx': 'none' }, full ? h('img', { src: full, alt: m.name, draggable: 'false' }) : memberFace(m, 'neutral', 'lg'));
    onTap(figure, () => {
      const r = game.talk(m.id);
      if (!r) return;
      sfx.tap();
      say(m, r.e, r.t);
      figure.classList.remove('is-bounce');
      void figure.offsetWidth;
      figure.classList.add('is-bounce');
      if (r.xp) popNumber(figure, `💗 +${r.xp}`, 'fx-pop--bond');
    });

    const fill = h('div', { class: 'heart-bar__fill' });
    fill.style.width = `${p ? (p.current / p.need) * 100 : 100}%`;

    // 선물 (giftsLeft가 날짜 바뀜도 정리한다)
    const left = game.giftsLeft(m.id);
    const talksLeft = Math.max(0, BALANCE.bond.talksPerDay - b.talks);
    giftBtns = [];
    const gifts = BALANCE.bond.gifts.map((g) => {
      const cost = game.giftCost(g.id);
      const xp = giftXp(m.id, g.id);
      const fav = info.favorite === g.id;
      const btn = h(
        'button',
        { class: `gift${fav ? ' is-fav' : ''}`, type: 'button', disabled: left <= 0 || game.state.listeners < cost, 'data-sfx': 'none' },
        h('span', { class: 'gift__emoji' }, g.emoji),
        h('strong', {}, g.name),
        h('small', {}, `💗 +${xp}${fav ? ' ★좋아함' : ''}`),
        h('small', { class: 'gift__cost' }, `청취자 ${formatNumber(cost)}`),
      );
      giftBtns.push({ btn, cost, left });
      onTap(btn, () => {
        const got = game.gift(m.id, g.id);
        if (got === null) return;
        sfx.coin();
        popNumber(btn, `💗 +${got}`, 'fx-pop--bond');
        sparkle(btn, 10, m.color);
        say(m, fav ? 'blush' : 'smile', fav ? '헉, 이거… 내가 좋아하는 거 어떻게 알았어?' : GIFT_THANKS[g.id] ?? '고마워!');
      });
      return btn;
    });

    // 레벨 대사
    const lines = info.lines.map((l, i) => {
      const open = i < lv;
      const row = h('button', { class: `bline${open ? '' : ' is-locked'}`, type: 'button', disabled: !open }, h('span', { class: 'bline__lv' }, `Lv.${i + 1}`), h('span', {}, open ? l.t : `호감도 Lv.${i + 1}에서 열려요 · 능력치 +${Math.round(BALANCE.bond.statPerLevel * 100 * i)}%`));
      if (open) onTap(row, () => say(m, l.e, l.t));
      return row;
    });

    // 개인 이벤트
    const events = NARRATIVE.events[m.id].map((ev) => {
      const open = lv >= ev.level;
      const seen = b.seenEvents.includes(ev.level);
      const row = h(
        'button',
        { class: `event-row${open ? '' : ' is-locked'}${open && !seen ? ' is-new' : ''}`, type: 'button', disabled: !open },
        h('span', { class: 'event-row__lv' }, `💗${ev.level}`),
        h('strong', {}, open ? ev.title : '???'),
        h('span', { class: 'event-row__state' }, !open ? `Lv.${ev.level}에서 열림` : seen ? '다시보기 ↺' : 'NEW ▶'),
      );
      if (open) onTap(row, () => playEvent(game, m.id, ev.level));
      return row;
    });

    const phoneBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '📱 문자 보기');
    onTap(phoneBtn, () => openPhone(game, m.id));

    detail.replaceChildren(
      h(
        'div',
        { class: 'mstage' },
        figure,
        bubble,
        h('div', { class: 'mstage__hint' }, talksLeft > 0 ? `탭해서 대화 · 오늘 호감도 ${talksLeft}회 더` : '탭해서 대화'),
      ),
      h(
        'div',
        { class: 'mdetail__side' },
        h(
          'div',
          { class: 'panel mcard' },
          h('div', { class: 'mcard__head' }, h('h2', { class: 'panel__title' }, m.name), h('span', { class: 'mcard__tag' }, m.tagline), phoneBtn),
          h('div', { class: 'mcard__lv' }, h('strong', {}, `💗 호감도 Lv.${lv}`), h('span', {}, p ? `${Math.floor(p.current)} / ${p.need}` : 'MAX')),
          h('div', { class: 'heart-bar heart-bar--big' }, fill),
          h('p', { class: 'mcard__bonus' }, `${m.name} 카드 능력치 +${Math.round((bondStatMult(lv) - 1) * 100)}% · 방송에 배치해 두면 1분마다 호감도 +${BALANCE.bond.placementXpPerMin}`),
        ),
        h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '선물'), h('span', { class: 'panel__sub' }, `오늘 ${left} / ${BALANCE.bond.giftsPerDay}회`)), h('div', { class: 'gifts' }, ...gifts)),
        h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '단둘이 이벤트')), h('div', { class: 'event-list' }, ...events)),
        h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '호감도 대사')), h('div', { class: 'blines' }, ...lines)),
      ),
    );
    detail.style.setProperty('--member-color', m.color);
  }

  // ── 메인 스토리
  function renderStory() {
    story.replaceChildren(
      h('div', { class: 'chapters__intro' }, h('strong', {}, '“7일 후, 세계는 끝납니다.”'), h('p', {}, '어느 날 방송실 라디오에 잡힌 정체불명의 신호. 누적 청취자 목표를 달성할 때마다 다음 이야기가 열려요.')),
      ...CHAPTERS.map((c) => {
        const open = isChapterOpen(game, c.id);
        const seen = game.state.story.seen.includes(c.id);
        const need = chapterUnlock(c.id);
        const row = h(
          'button',
          { class: `chapter${open ? '' : ' is-locked'}${open && !seen ? ' is-new' : ''}`, type: 'button', disabled: !open },
          h('span', { class: 'chapter__no' }, `CH.${c.id}`),
          h('div', { class: 'chapter__text' }, h('small', {}, c.day), h('strong', {}, open ? c.title : '???')),
          h('span', { class: 'chapter__state' }, !open ? `🔒 마일스톤 ${need}개 (${game.state.milestonesReached}/${need})` : seen ? '다시보기 ↺' : 'NEW ▶'),
        );
        if (open) onTap(row, () => playChapter(game, c.id));
        return row;
      }),
    );
  }

  // ── 추억 앨범: 본 챕터·이벤트 다시보기 + 레벨 10 CG
  function renderAlbum() {
    const cgs = MEMBERS.map((m) => {
      const seen = game.state.bond[m.id].seenEvents.includes(10);
      const url = cgUrl(m.id);
      const tile = h(
        'button',
        { class: `cg-tile${seen ? '' : ' is-locked'}`, type: 'button', disabled: !seen },
        seen && url ? h('img', { src: url, alt: `${m.name} CG` }) : h('span', { class: 'cg-tile__empty' }, seen ? '🖼️ CG 준비 중' : '🔒'),
        h('small', {}, seen ? m.name : `${m.name} 💗10`),
      );
      if (seen) onTap(tile, () => playEvent(game, m.id, 10));
      return tile;
    });
    const seenEvents = MEMBERS.flatMap((m) =>
      NARRATIVE.events[m.id]
        .filter((ev) => game.state.bond[m.id].seenEvents.includes(ev.level))
        .map((ev) => {
          const b = h('button', { class: 'album-row', type: 'button' }, memberFace(m, 'smile', 'sm'), h('span', {}, `💗${ev.level} ${ev.title}`), h('span', { class: 'chapter__state' }, '↺'));
          onTap(b, () => playEvent(game, m.id, ev.level));
          return b;
        }),
    );
    const seenChapters = CHAPTERS.filter((c) => game.state.story.seen.includes(c.id)).map((c) => {
      const b = h('button', { class: 'album-row', type: 'button' }, h('span', { class: 'chapter__no' }, `CH.${c.id}`), h('span', {}, c.title), h('span', { class: 'chapter__state' }, '↺'));
      onTap(b, () => playChapter(game, c.id));
      return b;
    });
    album.replaceChildren(
      h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '스페셜 CG'), h('span', { class: 'panel__sub' }, '호감도 10 이벤트')), h('div', { class: 'cg-grid' }, ...cgs)),
      h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '메인 스토리')), seenChapters.length ? h('div', { class: 'album-list' }, ...seenChapters) : h('p', { class: 'empty' }, '아직 본 챕터가 없어요')),
      h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, '단둘이 이벤트')), seenEvents.length ? h('div', { class: 'album-list' }, ...seenEvents) : h('p', { class: 'empty' }, '호감도 Lv.2부터 이벤트가 열려요')),
    );
  }

  let giftBtns: { btn: HTMLButtonElement; cost: number; left: number }[] = [];
  let lastKey = '';
  function render() {
    renderTabs();
    if (view === 'members') {
      renderList();
      renderDetail();
      body.replaceChildren(h('div', { class: 'members__grid' }, list, detail));
    } else if (view === 'story') {
      renderStory();
      body.replaceChildren(story);
    } else {
      renderAlbum();
      body.replaceChildren(album);
    }
  }

  return {
    el,
    render() {
      // 숫자만 바뀌는 잦은 changed 이벤트에는 다시 그리지 않는다 (말풍선·애니메이션 유지)
      const s = game.state;
      const key = JSON.stringify([view, selected, s.bond, s.story.seen, s.milestonesReached, Math.floor(Math.log10(Math.max(1, s.listeners)) * 4)]);
      if (key === lastKey) return;
      lastKey = key;
      render();
    },
    tick() {
      for (const g of giftBtns) {
        const off = g.left <= 0 || game.state.listeners < g.cost;
        if (g.btn.disabled !== off) g.btn.disabled = off;
      }
    },
  };
}

/** 호감도 레벨업 알림 */
export function announceBondLevel(memberId: string, level: number): void {
  const m = getMember(memberId);
  if (!m) return;
  sfx.levelUp();
  const ev = BALANCE.bond.eventLevels.includes(level as never);
  toast(`💗 ${m.name} 호감도 Lv.${level}! 새 대사${ev ? ' · 단둘이 이벤트' : ''}가 열렸어요`);
}

