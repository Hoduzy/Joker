import type { Game } from '../core/game';
import { getCard, portraitKey } from '../data/cards';
import { cardArtUrl } from '../data/portraits';
import { playBgm, unlockAudio } from './audio';
import { h } from './dom';
import { bgUrl } from './vn';

/**
 * 타이틀 화면. 아이패드 사파리는 첫 터치 전엔 소리를 못 내므로 두 단계로:
 *   ① "화면을 터치하세요" — 첫 터치에 소리를 깨우고 타이틀 곡(title)
 *   ② "▶ 방송 시작" — 한 번 더 누르면 메인 화면으로 (main 곡으로 크로스페이드)
 * 로비 캐릭터를 골라 두었으면 그 카드 그림이 옆에 선다
 */
export function showTitleScreen(game?: Game): void {
  const prompt = h('span', { class: 'title-screen__prompt' }, '화면을 터치하세요');
  const lobbyCard = game?.state.lobbyCard ? getCard(game.state.lobbyCard) : undefined;
  const lobbyArt = lobbyCard ? cardArtUrl(lobbyCard.id, portraitKey(lobbyCard), lobbyCard.member).url : undefined;
  const el = h(
    'div',
    { class: 'title-screen', role: 'button', 'aria-label': '게임 시작' },
    h('div', { class: 'title-screen__bg' }),
    lobbyArt ? h('img', { class: 'title-screen__lobby', src: lobbyArt, alt: '', draggable: 'false' }) : null,
    h(
      'div',
      { class: 'title-screen__logo' },
      h('small', { class: 'title-screen__over' }, 'HAESOL HIGH SCHOOL · FM 89.7'),
      h('strong', { class: 'title-screen__name' }, '심야방송부'),
      h('p', { class: 'title-screen__tag' }, '“이 방송이, 들리나요?”'),
    ),
    h('div', { class: 'title-screen__foot' }, h('i', { class: 'tcard__lamp' }), prompt),
  );
  const bg = bgUrl('rooftop');
  if (bg) (el.querySelector('.title-screen__bg') as HTMLElement).style.backgroundImage = `url("${bg}")`;
  document.body.append(el);

  let awake = false;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!awake) {
      awake = true;
      unlockAudio();
      playBgm('title');
      el.classList.add('is-awake');
      prompt.textContent = '▶ 방송 시작';
      return;
    }
    playBgm('main');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 700);
  });
}
