import { h } from './dom';

let container: HTMLElement | null = null;

/** 화면 위쪽에 잠깐 뜨는 알림 */
export function toast(message: string, icon?: Node): void {
  if (!container) {
    container = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(container);
  }
  const el = h('div', { class: 'toast' }, icon ?? null, h('span', {}, message));
  container.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

export function gemIcon(): HTMLElement {
  return h('span', { class: 'gem', 'aria-hidden': 'true' });
}
