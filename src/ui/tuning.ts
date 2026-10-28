import { gradeAccident, isLocked, rollAccident, signalStrength, tuneHint, type AccidentGrade } from '../core/accident';
import type { Game } from '../core/game';
import lines from '../data/accident.json';
import { BALANCE } from '../data/balance';
import { getCard } from '../data/cards';
import { pick } from '../data/flavor';
import { getMember } from '../data/members';
import { celebrate } from './celebrate';
import type { Chat } from './chat';
import { h, memberFace, onTap } from './dom';
import { lightPillar } from './fx';
import { reducedMotion } from './motion';
import { sfx, staticRadio } from './sfx';
import type { Studio } from './studio';

type Lines = Record<string, string[]>;
const START = lines.start as Lines;
const RELIEF = lines.relief as Lines;
const FAIL = lines.fail as Lines;
const HINT = lines.hint as Lines;

const GRADE_TEXT: Record<AccidentGrade, { title: string; sub: (b: { multiplier: number; durationMs: number } | null) => string }> = {
  perfect: { title: '✨ 완벽 복구!', sub: (b) => `${(b?.durationMs ?? 0) / 1000}초간 청취자 ×${b?.multiplier}` },
  good: { title: '📻 복구!', sub: (b) => `${(b?.durationMs ?? 0) / 1000}초간 청취자 ×${b?.multiplier}` },
  barely: { title: '😮‍💨 겨우 복구…', sub: () => '보너스 없음 · 다음엔 더 빨리!' },
  fail: { title: '📡 복구 실패…', sub: (b) => `${(b?.durationMs ?? 0) / 1000}초간 생산 절반` },
};

function assignedMembers(game: Game): string[] {
  return Object.values(game.state.assignments)
    .map((id) => (id ? getCard(id)?.member : undefined))
    .filter((m): m is string => !!m);
}

const fmt = (f: number) => f.toFixed(1);

/**
 * 방송사고 = 전파 이탈. 화면에 지지직 노이즈 + 경고음, 가운데 작은 다이얼 팝업 (방치 화면 위에 겹친다).
 * 다이얼을 돌려 원래 주파수(89.7)로 되돌리고, 신호가 초록인 채로 1초 버티면 복구.
 * 잡기 시작한 시간으로 판정: 3초 완벽(×3) / 6초 복구(×2) / 제한 시간 안 겨우 복구 / 실패(생산 절반)
 */
export function startTuning(game: Game, studio: Studio, chat: Chat, done: () => void): void {
  const a = BALANCE.accident;
  const setup = rollAccident(game.state);
  const calm = reducedMotion();
  let dial = setup.start;
  let drift = 0;
  let driftKick = 0;
  let lockStart: number | null = null;
  let over = false;
  let start = 0;
  let lastTick = Math.round(dial * 10);
  let hintAt = -Infinity;
  let wasLocked = false;

  // ── 화면
  const timeFill = h('div', { class: 'tuner__time-fill' });
  const freq = h('strong', { class: 'tuner__freq' }, fmt(dial));
  const gauge = h('div', { class: 'tuner__gauge', 'aria-hidden': 'true' }, ...Array.from({ length: 10 }, () => h('i')));
  const knob = h('div', { class: 'tuner__knob' }, h('i', { class: 'tuner__grip' }));
  const dialEl = h('div', { class: 'tuner__dial', role: 'slider', tabindex: 0, 'aria-label': '주파수 다이얼', 'aria-valuemin': a.dialMin, 'aria-valuemax': a.dialMax }, h('div', { class: 'tuner__ticks' }), knob);
  const left = h('button', { class: 'tuner__nudge', type: 'button', 'aria-label': '주파수 내리기' }, '◀');
  const right = h('button', { class: 'tuner__nudge', type: 'button', 'aria-label': '주파수 올리기' }, '▶');
  const hintText = h('span', {});
  const mirae = getMember('mirae');
  const hint = setup.miraeHelps && mirae ? h('div', { class: 'tuner__hint' }, memberFace(mirae, 'neutral', 'sm', game.outfitOf('mirae')), hintText) : null;
  const result = h('div', { class: 'tuner__result', hidden: true });
  const box = h(
    'div',
    { class: 'tuner__box', role: 'alertdialog', 'aria-label': '전파 이탈! 다이얼을 돌려 주파수를 맞추세요' },
    h('div', { class: 'tuner__head' }, h('span', { class: 'tuner__alert' }, '📡 전파 이탈!'), setup.unstable ? h('span', { class: 'tuner__unstable' }, '불안정 신호') : null),
    h('div', { class: 'tuner__screen' }, freq, h('span', { class: 'tuner__unit' }, 'MHz'), h('small', { class: 'tuner__target' }, `방송 주파수 FM ${fmt(setup.target)}`)),
    gauge,
    h('div', { class: 'tuner__controls' }, left, dialEl, right),
    hint,
    h('p', { class: 'tuner__help' }, '다이얼을 돌려 신호가 초록일 때 1초 유지!'),
    result,
  );
  const root = h(
    'div',
    { class: `tuner${calm ? ' is-calm' : ''}` },
    h('div', { class: 'tuner__noise' }),
    h('div', { class: 'tuner__bars' }),
    h('div', { class: 'tuner__time' }, timeFill),
    box,
  );
  document.body.append(root);
  document.body.classList.add('is-offair');
  const radio = staticRadio();
  sfx.alarm();
  chat.burst('accident', 3);
  assignedMembers(game).forEach((m, i) => setTimeout(() => !over && studio.say(m, pick(START[m] ?? []) ?? '…!', 2600), 250 + i * 450));
  if (hint) hintText.textContent = setup.unstable ? lines.unstable[0] : pick(HINT[tuneHint(dial, setup.target)]) ?? '';

  // ── 다이얼 조작: 손가락으로 돌린 각도만큼 주파수가 움직인다 (한 바퀴 = mhzPerTurn MHz)
  const setDial = (v: number) => {
    dial = Math.min(a.dialMax, Math.max(a.dialMin, v));
    const step = Math.round(dial * 10);
    if (step !== lastTick) {
      lastTick = step;
      sfx.dialTick();
    }
  };
  let lastAngle: number | null = null;
  const angleOf = (e: PointerEvent) => {
    const r = dialEl.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  dialEl.addEventListener('pointerdown', (e) => {
    if (over) return;
    e.preventDefault();
    dialEl.setPointerCapture(e.pointerId);
    lastAngle = angleOf(e);
  });
  dialEl.addEventListener('pointermove', (e) => {
    if (lastAngle === null || over) return;
    const ang = angleOf(e);
    let d = ang - lastAngle;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    lastAngle = ang;
    setDial(dial + (d / (2 * Math.PI)) * a.mhzPerTurn);
  });
  const release = () => (lastAngle = null);
  dialEl.addEventListener('pointerup', release);
  dialEl.addEventListener('pointercancel', release);
  dialEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    setDial(dial + (e.deltaY > 0 ? -0.1 : 0.1));
  });
  dialEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setDial(dial + 0.1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setDial(dial - 0.1);
  });
  onTap(left, () => !over && setDial(Math.round((dial - 0.1) * 10) / 10));
  onTap(right, () => !over && setDial(Math.round((dial + 0.1) * 10) / 10));

  // ── 매 프레임
  const frame = (t: number) => {
    if (over) return;
    if (!start) start = t;
    const elapsed = t - start;
    // 불안정 신호: 천천히 일렁이다가 가끔 툭 밀린다
    if (setup.unstable) {
      if (Math.random() < 0.012) driftKick = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.5);
      driftKick *= 0.985;
      drift = Math.sin(elapsed / 650) * 0.22 + driftKick;
    }
    const eff = Math.round((dial + drift) * 100) / 100;
    const strength = signalStrength(eff, setup.target);
    const locked = isLocked(eff, setup.target);
    freq.textContent = fmt(eff);
    knob.style.transform = `rotate(${((dial - a.dialMin) / a.mhzPerTurn) * 360}deg)`;
    dialEl.setAttribute('aria-valuenow', fmt(eff));
    root.style.setProperty('--noise', String(0.15 + 0.6 * (1 - strength)));
    radio.set(strength);
    const lit = Math.round(strength * 10);
    gauge.querySelectorAll('i').forEach((bar, i) => (bar.className = i < lit ? (locked ? 'is-green' : strength > 0.6 ? 'is-yellow' : 'is-red') : ''));
    box.classList.toggle('is-locked', locked);
    // 남은 시간 바
    timeFill.style.width = `${Math.max(0, 1 - elapsed / setup.timeLimitMs) * 100}%`;
    timeFill.classList.toggle('is-low', elapsed > setup.timeLimitMs * 0.7);
    // 미래 힌트 (2초마다, 맞았을 땐 바로)
    if (hint && (elapsed - hintAt > 2000 || locked !== wasLocked)) {
      hintAt = elapsed;
      hintText.textContent = pick(HINT[tuneHint(eff, setup.target)]) ?? '';
    }
    if (locked && !wasLocked) sfx.locked();
    wasLocked = locked;
    // 초록으로 holdMs 버티면 복구 (잡기 시작한 시각으로 판정)
    if (locked) {
      lockStart ??= elapsed;
      if (elapsed - lockStart >= a.holdMs) return finish(gradeAccident(lockStart, setup.timeLimitMs));
    } else lockStart = null;
    // 시간 초과: 이미 잡고 버티는 중이면 버티기를 끝까지 기다린다
    if (elapsed >= setup.timeLimitMs && lockStart === null) return finish('fail');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function finish(grade: AccidentGrade) {
    over = true;
    radio.stop();
    const boost = game.resolveAccident(grade);
    sfx.tuneResult(grade);
    const text = GRADE_TEXT[grade];
    result.replaceChildren(h('strong', {}, text.title), h('span', {}, text.sub(boost)));
    result.hidden = false;
    root.classList.add(`is-${grade}`, 'is-over');
    const members = assignedMembers(game);
    if (grade === 'fail') {
      chat.burst('accidentFailed', 2);
      members.forEach((m, i) => setTimeout(() => studio.say(m, pick(FAIL[m] ?? []) ?? '…', 3000), 600 + i * 400));
      // 벌칙 동안 화면이 살짝 지지직
      document.body.classList.add('is-static');
      setTimeout(() => document.body.classList.remove('is-static'), boost?.durationMs ?? a.penaltyMs);
    } else {
      document.body.classList.remove('is-offair');
      chat.burst('accidentFixed', grade === 'perfect' ? 4 : 2);
      // ON AIR 램프가 다시 켜지고, 배치된 부원들이 폴짝 + 안도
      members.forEach((m, i) =>
        setTimeout(() => {
          studio.cheer(m);
          studio.say(m, pick(RELIEF[m] ?? []) ?? '휴…', 3000);
        }, 500 + i * 300),
      );
      if (grade === 'perfect') {
        if (!calm) lightPillar('#7dffb2', true);
        celebrate('✨ 완벽 복구!', text.sub(boost));
      }
    }
    setTimeout(() => {
      document.body.classList.remove('is-offair');
      root.classList.add('is-closing');
      setTimeout(() => {
        root.remove();
        done();
      }, 250);
    }, 1500);
  }
}
