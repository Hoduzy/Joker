import type { Game } from '../core/game';
import { DEMO_SCENE } from '../data/narrative';
import { h, onTap } from './dom';
import { openModal } from './modal';
import { reduceMotionSetting, setReduceMotion } from './motion';
import { ensureName } from './storyView';
import { audioSettings, setAudioSettings } from './audio';
import { sfx } from './sfx';
import { playScript } from './vn';

/** 설정: 배경음악·효과음 볼륨, 음소거, 연출 줄이기, 연출 테스트, 이름, 크레딧, 데이터 초기화 */
export function openSettings(game: Game): void {
  // 소리: 배경음악·효과음 볼륨 따로, 음소거
  const slider = (key: 'bgm' | 'sfx', label: string) => {
    const input = h('input', { class: 'volume__range', type: 'range', min: 0, max: 100, step: 5, value: Math.round(audioSettings()[key] * 100), 'aria-label': label }) as HTMLInputElement;
    const num = h('span', { class: 'volume__num' }, `${input.value}`);
    input.addEventListener('input', () => {
      num.textContent = input.value;
      setAudioSettings({ [key]: Number(input.value) / 100 });
    });
    // 효과음은 놓을 때 소리로 확인
    if (key === 'sfx') input.addEventListener('change', () => sfx.chime());
    return h('span', { class: 'volume' }, input, num);
  };
  const mute = h('button', { class: 'toggle', type: 'button', role: 'switch' });
  const renderMute = () => {
    const on = audioSettings().muted;
    mute.classList.toggle('is-on', on);
    mute.setAttribute('aria-checked', String(on));
    mute.textContent = on ? '음소거' : '꺼짐';
  };
  onTap(mute, () => {
    setAudioSettings({ muted: !audioSettings().muted });
    renderMute();
  });
  renderMute();

  // 말소리: 대사가 타이핑될 때 부원마다 다른 짧은 소리 (효과음 볼륨을 따른다)
  const voice = h('button', { class: 'toggle', type: 'button', role: 'switch' });
  const renderVoice = () => {
    const on = audioSettings().voice;
    voice.classList.toggle('is-on', on);
    voice.setAttribute('aria-checked', String(on));
    voice.textContent = on ? '켜짐' : '꺼짐';
  };
  onTap(voice, () => {
    setAudioSettings({ voice: !audioSettings().voice });
    renderVoice();
  });
  renderVoice();

  const credits = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '보기');
  onTap(credits, () =>
    openModal({
      title: '🎞️ 크레딧',
      body: h(
        'div',
        { class: 'credits' },
        h('strong', { class: 'credits__title' }, '해솔고 심야방송부'),
        h('dl', {}, h('dt', {}, 'Music'), h('dd', {}, 'Suno로 제작')),
        h('small', {}, '오늘 밤도 늦게까지 깨어 있는 여러분, 안녕히.'),
      ),
      confirmLabel: '닫기',
      confirmGhost: true,
      onConfirm: () => openSettings(game),
    }),
  );

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

  // 개발자 옵션: 날짜와 상관없이 시즌 이벤트를 연다 (끄면 원래 기간대로)
  const force = h('button', { class: 'toggle', type: 'button', role: 'switch' });
  const renderForce = () => {
    const on = game.state.events.force;
    force.classList.toggle('is-on', on);
    force.setAttribute('aria-checked', String(on));
    force.textContent = on ? '켜짐' : '꺼짐';
  };
  onTap(force, () => {
    game.setEventForce(!game.state.events.force);
    renderForce();
  });
  renderForce();

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
    h('div', { class: 'settings__row' }, h('span', {}, '🎵 배경음악'), slider('bgm', '배경음악 볼륨')),
    h('div', { class: 'settings__row' }, h('span', {}, '🔊 효과음'), slider('sfx', '효과음 볼륨')),
    h('div', { class: 'settings__row' }, h('span', {}, '🗣️ 말소리'), voice),
    h('div', { class: 'settings__row' }, h('span', {}, '🔇 음소거'), mute),
    h('div', { class: 'settings__row' }, h('span', {}, '🎬 연출 줄이기'), motion),
    h('div', { class: 'settings__row' }, h('span', {}, '🎞️ 연출 테스트'), demo),
    h('div', { class: 'settings__row' }, h('span', {}, '✏️ 주인공 이름'), nameBtn),
    h(
      'div',
      { class: 'settings__row' },
      h('span', {}, '🖼️ 캐릭터 이미지'),
      h('span', { class: 'settings__links' }, h('a', { class: 'btn btn--ghost btn--small', href: './preview.html' }, '미리보기'), h('a', { class: 'btn btn--ghost btn--small', href: './stands.html' }, '스탠딩')),
    ),
    h('div', { class: 'settings__row' }, h('span', {}, '🎞️ 크레딧'), credits),
    h('div', { class: 'settings__row settings__row--dev' }, h('span', {}, '🛠️ 이벤트 강제 시작', h('small', {}, '개발자 옵션 · 기간과 상관없이 이벤트를 열어요')), force),
    h('div', { class: 'settings__row' }, h('span', {}, '🗑️ 저장 데이터'), reset),
  );
  openModal({ title: '⚙️ 설정', body, confirmLabel: '닫기', confirmGhost: true });
}
