import { h, onTap } from './dom';

export interface SheetOption {
  content: Node;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface SheetConfig {
  title: string;
  subtitle?: string;
  options: SheetOption[];
}

/** 화면 아래에서 올라오는 선택 시트. 한 번에 하나만 열린다. */
export function openSheet(config: SheetConfig): void {
  closeSheet();
  const list = h('div', { class: 'sheet__list' });
  for (const opt of config.options) {
    const btn = h(
      'button',
      {
        class: `sheet__option${opt.selected ? ' is-selected' : ''}`,
        type: 'button',
        disabled: opt.disabled,
      },
      opt.content,
    );
    onTap(btn, () => {
      closeSheet();
      opt.onSelect();
    });
    list.append(btn);
  }

  const closeBtn = h('button', { class: 'sheet__close', type: 'button', 'aria-label': '닫기' }, '✕');
  onTap(closeBtn, closeSheet);

  const panel = h(
    'div',
    { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true' },
    h(
      'div',
      { class: 'sheet__header' },
      h('div', {}, h('h2', { class: 'sheet__title' }, config.title), config.subtitle ? h('p', { class: 'sheet__subtitle' }, config.subtitle) : null),
      closeBtn,
    ),
    list,
  );
  const backdrop = h('div', { class: 'sheet', id: 'sheet' }, panel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));
}

export function closeSheet(): void {
  document.getElementById('sheet')?.remove();
}
