import { h } from './dom';

const COLORS = ['#ffcf5c', '#ff6bd9', '#5cc8ff', '#6ee7a8', '#ff8a5c', '#b07cff'];

/** 화면 가운데 축하 배너 + 색종이. 조작을 막지 않는다. */
export function celebrate(title: string, subtitle: string): void {
  document.querySelector('.celebrate')?.remove();
  const confetti = h('div', { class: 'confetti' });
  for (let i = 0; i < 46; i++) {
    const piece = h('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.setProperty('--d', `${Math.random() * 400}ms`);
    piece.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty('--t', `${1800 + Math.random() * 1200}ms`);
    confetti.append(piece);
  }
  const root = h(
    'div',
    { class: 'celebrate', 'aria-live': 'polite' },
    confetti,
    h('div', { class: 'celebrate__banner' }, h('div', { class: 'celebrate__title' }, title), h('div', { class: 'celebrate__sub' }, subtitle)),
  );
  document.body.append(root);
  setTimeout(() => root.remove(), 3400);
}
