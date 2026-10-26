import type { Game } from '../core/game';
import { DEMO_SCENE } from '../data/narrative';
import { h, onTap } from './dom';
import { openModal } from './modal';
import { reduceMotionSetting, setReduceMotion } from './motion';
import { ensureName } from './storyView';
import { setSoundEnabled, sfx, soundEnabled } from './sfx';
import { playScript } from './vn';

/** 설정: 효과음, 연출 줄이기, 연출 테스트, 이름, 데이터 초기화 */
export function openSettings(game: Game): void {
  const sound = h('button', { class: 'toggle', type: 'button', role: 'switch' });
  const renderSound = () => {
    const on = soundEnabled();
    sound.classList.toggle('is-on', on);
    sound.setAttribute('aria-checked', String(on));
    sound.textContent = on ? '켜짐' : '꺼짐';
  };
  onTap(sound, () => {
    setSoundEnabled(!soundEnabled());
    renderSound();
    sfx.chime();
  });
  renderSound();

  // 연출 줄이기: 화면·캐릭터 흔들림과 숨쉬기 움직임을 끈다
  const motion = h('button', { class: 'toggle', type: 'button', role: 'switch' });
  const renderMotion = () => {
    const on = reduceMotionSetting();
    motion.classList.toggle('is-on', on);
    motion.setAttribute('aria-checked', String(on));
    motion.textContent = on ? '켜짐' : '꺼짐';
  };
  onTap(motion, () => {
    setReduceMotion(!reduceMotionSetting());
    renderMotion();
  });
  renderMotion();

  const demo = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '보기');
  onTap(demo, () => {
    document.getElementById('modal')?.remove();
    playScript({ title: DEMO_SCENE.title, lines: DEMO_SCENE.lines, replay: true, name: game.state.story.name });
  });

  const reset = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '데이터 초기화');
  onTap(reset, () =>
    openModal({
      title: '처음부터 다시 할까요?',
      body: h('p', {}, '저장된 진행 상황과 카드, 호감도, 스토리 기록이 모두 삭제됩니다.'),
      cancelLabel: '취소',
      confirmLabel: '초기화',
      onConfirm: () => game.reset(),
    }),
  );

  const nameBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, game.state.story.name || '정하기');
  onTap(nameBtn, () => ensureName(game, () => openSettings(game), true));

  const body = h(
    'div',
    { class: 'settings' },
    h('div', { class: 'settings__row' }, h('span', {}, '🔊 효과음'), sound),
    h('div', { class: 'settings__row' }, h('span', {}, '🎬 연출 줄이기'), motion),
    h('div', { class: 'settings__row' }, h('span', {}, '🎞️ 연출 테스트'), demo),
    h('div', { class: 'settings__row' }, h('span', {}, '✏️ 주인공 이름'), nameBtn),
    h(
      'div',
      { class: 'settings__row' },
      h('span', {}, '🖼️ 캐릭터 이미지'),
      h('span', { class: 'settings__links' }, h('a', { class: 'btn btn--ghost btn--small', href: './preview.html' }, '미리보기'), h('a', { class: 'btn btn--ghost btn--small', href: './stands.html' }, '스탠딩')),
    ),
    h('div', { class: 'settings__row' }, h('span', {}, '🗑️ 저장 데이터'), reset),
  );
  openModal({ title: '⚙️ 설정', body, confirmLabel: '닫기', confirmGhost: true });
}
