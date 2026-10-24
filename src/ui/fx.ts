import { h } from './dom';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 화면 좌표(또는 요소 위)에 떠오르는 숫자 */
export function popNumber(target: HTMLElement | { x: number; y: number }, text: string, cls = ''): void {
  let x: number, y: number;
  if (target instanceof HTMLElement) {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 3;
  } else ({ x, y } = target);
  const el = h('span', { class: `fx-pop ${cls}` }, text);
  el.style.left = `${x + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${y}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1100);
}

/** 화면 흔들기 */
export function shake(strength: 'sm' | 'lg' = 'lg'): void {
  if (reduced()) return;
  // body를 흔들면 fixed 오버레이 위치가 틀어지므로, 맨 위 오버레이(없으면 앱)를 흔든다
  const overlays = document.querySelectorAll<HTMLElement>('.pull, .battle, .vn, #modal .modal__panel');
  const root = overlays[overlays.length - 1] ?? document.getElementById('app');
  if (!root) return;
  root.classList.remove('fx-shake', 'fx-shake--sm');
  void root.offsetWidth;
  root.classList.add(strength === 'lg' ? 'fx-shake' : 'fx-shake--sm');
  setTimeout(() => root.classList.remove('fx-shake', 'fx-shake--sm'), 600);
}

/** 전설 이상 획득: 빛기둥 + 화면 흔들림 */
export function lightPillar(color: string, big = false): void {
  const el = h('div', { class: `fx-pillar${big ? ' fx-pillar--big' : ''}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  el.style.setProperty('--pillar', color);
  document.body.append(el);
  shake(big ? 'lg' : 'sm');
  setTimeout(() => el.remove(), big ? 1800 : 1300);
}

/** 요소 주변에 반짝이를 뿌린다 */
export function sparkle(target: HTMLElement, count = 18, color?: string): void {
  const rect = target.getBoundingClientRect();
  const layer = h('div', { class: 'sparkles', 'aria-hidden': 'true' });
  layer.style.left = `${rect.left + rect.width / 2}px`;
  layer.style.top = `${rect.top + rect.height / 2}px`;
  if (color) layer.style.setProperty('--spark', color);
  for (let i = 0; i < count; i++) {
    const s = h('i', { class: 'sparkle' });
    const a = (i / count) * Math.PI * 2;
    const dist = Math.max(rect.width, 80) * 0.5 + 30 + (i % 4) * 25;
    s.style.setProperty('--tx', `${Math.cos(a) * dist}px`);
    s.style.setProperty('--ty', `${Math.sin(a) * dist}px`);
    s.style.setProperty('--d', `${(i % 5) * 40}ms`);
    layer.append(s);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1400);
}
