import { h } from './dom';
import { reducedMotion } from './motion';
import { sfx } from './sfx';

/**
 * 에피소드 타이틀 카드 (라디오 방송부 테마).
 *   어두운 화면 → 다이얼 돌리는 지지직 + 주파수 숫자가 빠르게 바뀌다 멈춤
 *   → 노이즈 줄무늬가 걷히며 제목이 또렷해짐 (윗줄 CHAPTER · EPISODE, 가운데 제목, 아래 ON AIR 램프)
 *   → 1.5초 유지 → 페이드아웃하면서 배경과 첫 대사로
 * - unstable: 주파수가 끝까지 안 맞고 흔들린다 (서윤)
 * - 회상(frequency "1996"): 세피아 + 연도가 2026에서 1996으로 거슬러 내려가 잡힌다
 * - 탭하면 바로 건너뛰기, short(다시보기)면 1초, 연출 줄이기면 노이즈 없이 페이드만
 */
export interface TitleCard {
  /** 윗줄 (예: "CHAPTER 3 · EPISODE 2") */
  overline: string;
  title: string;
  /** "89.7" 같은 MHz, 회상은 "1996" */
  frequency: string;
  unstable?: boolean;
  /** 다시보기: 1초 */
  short?: boolean;
}

const FM_MIN = 87.5;
const FM_MAX = 108;
/** 전체 연출 시간표 (ms) */
const FULL = { sweepFrom: 250, lock: 1350, clear: 1900, out: 3400, gone: 3850 };
const SHORT = { sweepFrom: 0, lock: 0, clear: 150, out: 600, gone: 1000 };
const CALM = { sweepFrom: 0, lock: 0, clear: 400, out: 1900, gone: 2350 };

const needlePos = (mhz: number) => `${(((mhz - FM_MIN) / (FM_MAX - FM_MIN)) * 100).toFixed(2)}%`;

/** parent 위에 타이틀 카드를 띄운다. reveal: 페이드아웃이 시작될 때 (여기서 첫 대사를 시작) */
export function playTitleCard(parent: HTMLElement, card: TitleCard, reveal: () => void): void {
  const flashback = card.frequency === '1996';
  const target = flashback ? 1996 : Number(card.frequency);
  const reduced = reducedMotion();
  const plan = reduced ? (card.short ? SHORT : CALM) : card.short ? SHORT : FULL;
  const animated = !reduced && !card.short;

  const num = h('span', { class: 'tcard__num' }, flashback ? '2026' : card.frequency);
  const unit = h('small', { class: 'tcard__unit' }, flashback ? '' : 'MHz');
  const needle = h('i', { class: 'tcard__needle' });
  const scale = h(
    'div',
    { class: 'tcard__scale' },
    needle,
    h('div', { class: 'tcard__marks' }, ...[88, 92, 96, 100, 104, 108].map((m) => h('span', {}, String(m)))),
  );
  const noise = h('canvas', { class: 'tcard__noise', width: 128, height: 72 }) as HTMLCanvasElement;
  const el = h(
    'div',
    {
      class: `tcard${card.unstable ? ' is-unstable' : ''}${flashback ? ' is-flashback' : ''}${animated ? '' : ' is-calm'}`,
      role: 'button',
      'aria-label': `${card.overline} ${card.title} (눌러서 건너뛰기)`,
    },
    noise,
    h('div', { class: 'tcard__stripes' }),
    h(
      'div',
      { class: 'tcard__body' },
      h('div', { class: 'tcard__dial' }, h('div', { class: 'tcard__freq' }, num, unit), scale),
      h(
        'div',
        { class: 'tcard__text' },
        h('small', { class: 'tcard__over' }, card.overline),
        h('strong', { class: 'tcard__title' }, card.title),
        h('span', { class: 'tcard__air' }, h('i', { class: 'tcard__lamp' }), 'ON AIR'),
      ),
    ),
  );
  parent.append(el);

  const t0 = performance.now();
  let raf = 0;
  let out = false;
  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  const stopNoise = animated ? sfx.tuning((FULL.lock - FULL.sweepFrom + 150) / 1000 + (card.unstable ? 2.2 : 0), !!card.unstable) : () => {};

  // 시작값: 목표에서 멀리 떨어진 곳부터 돌린다
  const start = flashback ? 2026 : target > (FM_MIN + FM_MAX) / 2 ? FM_MIN + Math.random() * 3 : FM_MAX - Math.random() * 3;
  const startMhz = flashback ? FM_MAX - 1 : start;
  const endMhz = flashback ? FM_MIN + 1.5 : target;
  needle.style.left = needlePos(animated ? startMhz : endMhz);
  if (!animated) num.textContent = flashback ? '1996' : card.frequency;

  const ctx = noise.getContext('2d');
  const img = ctx?.createImageData(noise.width, noise.height);
  let frame = 0;
  const tick = (now: number) => {
    const t = now - t0;
    // 지지직 화면: 2프레임마다 새 노이즈
    if (ctx && img && frame++ % 2 === 0) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    if (t >= plan.sweepFrom && t < plan.lock) {
      // 빠르게 바뀌다가 감속하며 목표로
      const p = (t - plan.sweepFrom) / (plan.lock - plan.sweepFrom);
      const e = 1 - (1 - p) ** 3;
      const shake = (1 - p) * (flashback ? 4 : 1.6) * (Math.random() * 2 - 1);
      const v = start + (target - start) * e + shake;
      num.textContent = flashback ? String(Math.round(v)) : Math.min(FM_MAX, Math.max(FM_MIN, v)).toFixed(1);
      needle.style.left = needlePos(startMhz + (endMhz - startMhz) * e + shake * (flashback ? 0.3 : 1));
    } else if (t >= plan.lock && card.unstable && !flashback) {
      // 끝까지 안 맞는다: 목표 근처에서 계속 흔들림
      if (frame % 6 === 0) {
        const off = (Math.random() * 2 - 1) * 0.3;
        num.textContent = (target + off).toFixed(1);
        needle.style.left = needlePos(target + off * 1.5);
      }
    }
    if (!out) raf = requestAnimationFrame(tick);
  };
  if (animated) raf = requestAnimationFrame(tick);

  const lock = () => {
    el.classList.add('is-locked');
    if (!flashback && !card.unstable) {
      num.textContent = card.frequency;
      needle.style.left = needlePos(target);
    }
    if (flashback) {
      num.textContent = '1996';
      needle.style.left = needlePos(endMhz);
    }
    if (animated) (card.unstable ? sfx.detuned : sfx.tuned)();
  };
  at(plan.lock, lock);
  at(plan.clear, () => el.classList.add('is-clear'));

  const finish = (fast: boolean) => {
    if (out) return;
    out = true;
    timers.forEach((t) => window.clearTimeout(t));
    cancelAnimationFrame(raf);
    stopNoise();
    el.classList.add('is-locked', 'is-clear', 'is-out');
    if (fast) el.classList.add('is-skip');
    reveal();
    window.setTimeout(() => el.remove(), fast ? 260 : plan.gone - plan.out);
  };
  at(plan.out, () => finish(false));
  // 탭하면 바로 건너뛰기
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    finish(true);
  });
}
