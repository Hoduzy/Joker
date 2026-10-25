import { getCard } from '../data/cards';
import type { Game } from '../core/game';
import type { PullResult } from '../core/gacha';
import type { OfflineResult } from '../core/offline';
import { BALANCE } from '../data/balance';
import { formatDuration, formatNumber } from '../utils/format';
import { createCardList } from './cardList';
import { createCollection } from './collection';
import type { Component } from './component';
import { celebrate } from './celebrate';
import { createChat } from './chat';
import { createDelivery } from './delivery';
import { createDungeon } from './dungeon';
import { createDialogue } from './dialogue';
import { openCompare } from './equipCompare';
import { h } from './dom';
import { createGacha } from './gacha';
import { createHeader } from './header';
import { openModal } from './modal';
import { closeSheet } from './sheet';
import { createStudio } from './studio';
import { createTabs, ICONS } from './tabs';
import { gemIcon, toast } from './toast';
import { startLiveEvents } from './liveEvents';
import { announceBondLevel, createMembers, hasNewStory } from './members';
import { playEpisode } from './storyView';
import { CHAPTERS } from '../data/narrative';
import { missionDef } from '../core/missions';
import { createLockGate, lockNotice } from './locks';
import { openMissions } from './missionsView';
import { openPhone } from './phone';
import { openSettings } from './settings';
import { installSfx, sfx } from './sfx';
import { getMember } from '../data/members';

type ScreenId = 'studio' | 'members' | 'dungeon' | 'gacha' | 'collection';
const TAB_KEY = 'simya-bangsongbu/tab';
const RARITY_RANK = { R: 0, SR: 1, SSR: 2 } as const;

/** 화면 전체를 조립하고 게임 이벤트와 연결한다. */
export function mountApp(root: HTMLElement, game: Game): void {
  const dialogue = createDialogue((memberId) => {
    const cardId = Object.values(game.state.assignments).find((id) => id && getCard(id)?.member === memberId);
    return cardId ? getCard(cardId)?.outfit : undefined;
  });
  installSfx();
  const header = createHeader(game, {
    phone: () => openPhone(game),
    missions: () => (game.isUnlocked('missions') ? openMissions(game) : lockNotice('missions')),
    settings: () => openSettings(game),
  });
  const members = createMembers(game);
  const studio = createStudio(game, (id) => dialogue.say(id, 'poke'));
  const cardList = createCardList(game);
  const gacha = createGacha(game, (results) => sayAboutNewCard(results));
  const collection = createCollection(game);
  const delivery = createLockGate(game, 'box', createDelivery(game), '📦', '협찬사에서 장비를 보내 주기 시작해요. 택배를 열어 마이크·헤드폰 같은 장비를 모아 보세요.');
  delivery.el.classList.add('delivery-gate');
  const chat = createChat(game);
  const dungeon = createDungeon(game);
  const dungeonGate = createLockGate(game, 'dungeon', dungeon, '⚡', '이웃 학교 방송부들이 우리를 눈여겨보기 시작했어요. 청취자를 빼앗아 오는 대결이 열려요.');
  const gachaGate = createLockGate(game, 'gacha', gacha, '✉️', '방송이 조금 알려지면 입부 신청서가 날아오기 시작해요. 첫 목표를 달성해 보세요!');
  const components: Component[] = [header, delivery, studio, cardList, gachaGate, collection, chat, dungeonGate, members];

  const screens: Record<ScreenId, HTMLElement> = {
    studio: h(
      'main',
      { class: 'screen studio-screen', 'data-screen': 'studio' },
      delivery.el,
      chat.el,
      h(
        'div',
        { class: 'layout studio-main' },
        h('div', { class: 'layout__main' }, studio.el),
        h('div', { class: 'layout__side' }, cardList.el),
      ),
    ),
    members: h('main', { class: 'screen', 'data-screen': 'members' }, members.el),
    dungeon: h('main', { class: 'screen', 'data-screen': 'dungeon' }, dungeonGate.el),
    gacha: h('main', { class: 'screen', 'data-screen': 'gacha' }, gachaGate.el),
    collection: h('main', { class: 'screen', 'data-screen': 'collection' }, collection.el),
  };

  const tabs = createTabs(
    [
      { id: 'studio', label: '방송실', icon: ICONS.studio },
      { id: 'members', label: '부원', icon: ICONS.members },
      { id: 'dungeon', label: '대결', icon: ICONS.dungeon },
      { id: 'gacha', label: '뽑기', icon: ICONS.gacha },
      { id: 'collection', label: '도감', icon: ICONS.collection },
    ],
    (id) => show(id as ScreenId),
  );

  function show(id: ScreenId) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== id;
    tabs.select(id);
    closeSheet();
    window.scrollTo(0, 0);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // 무시
    }
  }

  root.replaceChildren(header.el, ...Object.values(screens), tabs.el, dialogue.el);

  const renderAll = () => {
    for (const c of components) c.render();
    for (const c of components) c.tick?.();
  };

  /** 이번 뽑기에서 새로 얻은 카드 중 가장 높은 등급의 부원이 한마디 */
  function sayAboutNewCard(results: PullResult[]) {
    const best = results.filter((r) => r.isNew).sort((a, b) => RARITY_RANK[b.card.rarity] - RARITY_RANK[a.card.rarity])[0];
    if (best) dialogue.say(best.card.member, 'newCard');
  }

  game.on((event) => {
    switch (event.type) {
      case 'changed':
        renderAll();
        break;
      case 'offline-reward':
        showOfflineReward(event.result, () => {
          const id = randomAssignedMember(game);
          if (id) dialogue.say(id, 'welcomeBack');
        });
        break;
      case 'assigned': {
        const now = event.cardId ? getCard(event.cardId) : undefined;
        const prev = event.previous ? getCard(event.previous) : undefined;
        if (now) dialogue.say(now.member, 'assigned');
        else if (prev) dialogue.say(prev.member, 'unassigned');
        break;
      }
      case 'tower-up': {
        toast(`송신탑 Lv.${event.level}! 전파석 +${event.reward}`, gemIcon());
        chat.burst('towerUp', 2);
        const id = randomAssignedMember(game);
        if (id) dialogue.say(id, 'towerUp');
        break;
      }
      case 'milestone': {
        celebrate(
          event.count > 1 ? `🎉 마일스톤 ${event.count}개 달성!` : `🎉 누적 청취자 ${formatNumber(event.threshold)}명 달성!`,
          `전파석 +${formatNumber(event.stones)}`,
        );
        chat.burst('milestone', 3);
        break;
      }
      case 'bond-level':
        announceBondLevel(event.member, event.level);
        break;
      case 'phone':
        sfx.chime();
        toast(`📱 ${getMember(event.member)?.name}에게서 문자가 왔어요`);
        break;
      case 'chapter': {
        const c = CHAPTERS.find((x) => x.id === event.id);
        if (!c) break;
        setTimeout(() => toast(`📖 메인 스토리 CHAPTER ${c.id} 「${c.title}」가 열렸어요 — 부원 › 메인 스토리`), 3000);
        // 첫 챕터는 바로 보여 준다 (다른 창이 떠 있지 않을 때)
        if (c.id === 1 && !game.state.story.seen.length) {
          const tryPlay = (left: number) => {
            if (document.querySelector('#modal, #sheet, .pull, .battle, .vn, .phone, .celebrate')) {
              if (left > 0) setTimeout(() => tryPlay(left - 1), 2000);
              return;
            }
            playEpisode(game, '1-1');
          };
          setTimeout(() => tryPlay(10), 4000);
        }
        break;
      }
      case 'unlock': {
        const names = event.items.map((u) => u.label).join(' · ');
        const sub = event.items.some((u) => u.slot) ? '새 부원을 배치할 수 있어요!' : '새 기능이 열렸어요!';
        // 마일스톤 축하와 같은 순간에 오는 경우가 많아, 그 축하가 끝난 뒤에 보여 준다
        const show = () => {
          sfx.levelUp();
          celebrate(`🔓 ${names} 열림!`, sub);
        };
        // (마일스톤 이벤트는 같은 프레임에 해금 다음으로 오므로 한 박자 늦춰 확인)
        setTimeout(() => (document.querySelector('.celebrate') ? setTimeout(show, 2600) : show()), 0);
        break;
      }
      case 'mission':
        sfx.chime();
        toast(`📋 미션 달성! ${missionDef(event.id)?.label ?? ''} — 보상을 받으세요`);
        break;
      case 'corner':
        toast('📻 날짜가 바뀌어 오늘의 코너가 바뀌었어요');
        break;
      case 'box-level':
        toast(
          event.level === BALANCE.box.autoUnlockLevel
            ? `📦 택배 Lv.${event.level}! 자동 개봉이 열렸어요`
            : `📦 택배 Lv.${event.level}! 좋은 장비가 더 잘 나와요`,
        );
        break;
    }
  });

  let saved: ScreenId = 'studio';
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t === 'gacha' || t === 'collection' || t === 'dungeon' || t === 'members') saved = t;
  } catch {
    // 무시
  }
  renderAll();
  show(saved);
  const live = startLiveEvents(game, studio, chat);
  game.on((e) => e.type === 'changed' && live.syncBubbles());
  // 헤더 높이(다음 목표 줄 포함)를 CSS에 알려 채팅 패널 높이를 맞춘다
  new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', `${header.el.offsetHeight}px`)).observe(header.el);
  // 고르지 않고 닫았던 장비가 있으면 다시 보여 준다
  if (game.state.box.pending && saved === 'studio') openCompare(game, game.state.box.pending);
  startLoop(game, components, tabs);
  bindLifecycle(game);
  // 접속 문자 (마지막으로 받은 지 몇 시간 지났으면)
  game.onSessionStart();
}

function randomAssignedMember(game: Game): string | undefined {
  const ids = Object.values(game.state.assignments)
    .filter((id): id is string => id !== null)
    .map((id) => getCard(id)?.member)
    .filter((m): m is string => !!m);
  return ids[Math.floor(Math.random() * ids.length)];
}

function showOfflineReward(result: OfflineResult, onClose: () => void): void {
  closeSheet();
  const capped = result.rawElapsedMs > result.elapsedMs;
  openModal({
    title: '방송은 계속되고 있었어요',
    body: h(
      'div',
      { class: 'offline' },
      h('p', {}, `자리를 비운 ${formatDuration(result.rawElapsedMs)} 동안`),
      h('p', { class: 'offline__amount' }, `+${formatNumber(result.earned)}`),
      h('p', {}, '명의 청취자가 모였습니다.'),
      capped ? h('p', { class: 'offline__note' }, `오프라인 보상은 최대 ${formatDuration(BALANCE.offlineCapMs)}까지 쌓여요.`) : null,
    ),
    confirmLabel: '좋아!',
    onConfirm: onClose,
  });
}

function startLoop(game: Game, components: Component[], tabs: ReturnType<typeof createTabs>): void {
  let dotClock = 0;
  const frame = () => {
    game.advance();
    for (const c of components) c.tick?.();
    tabs.setDot('gacha', game.canPull(1));
    if (++dotClock % 30 === 0) {
      tabs.setDot('members', hasNewStory(game));
      tabs.setLocked('dungeon', !game.isUnlocked('dungeon'));
      tabs.setLocked('gacha', !game.isUnlocked('gacha'));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function bindLifecycle(game: Game): void {
  // 홈 화면으로 나가거나 탭을 전환할 때 즉시 저장해서, 다음 실행 시 정확한 오프라인 시간을 계산한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      game.advance();
      game.save();
    }
  });
  window.addEventListener('pagehide', () => game.save());
}
