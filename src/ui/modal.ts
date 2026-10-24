import { h, onTap } from './dom';

export interface ModalConfig {
  title: string;
  body: Node;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  /** 넓은 창 (확률표, 카드 상세) */
  wide?: boolean;
}

/** 가운데 뜨는 알림/확인 창 */
export function openModal(config: ModalConfig): void {
  document.getElementById('modal')?.remove();
  const close = () => document.getElementById('modal')?.remove();

  const confirm = h('button', { class: 'btn btn--primary', type: 'button' }, config.confirmLabel ?? '확인');
  onTap(confirm, () => {
    close();
    config.onConfirm?.();
  });

  let cancel: HTMLElement | null = null;
  if (config.cancelLabel) {
    cancel = h('button', { class: 'btn btn--ghost', type: 'button' }, config.cancelLabel);
    onTap(cancel, close);
  }

  const root = h(
    'div',
    { class: 'modal', id: 'modal' },
    h(
      'div',
      { class: `modal__panel${config.wide ? ' modal__panel--wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
      h('h2', { class: 'modal__title' }, config.title),
      h('div', { class: 'modal__body' }, config.body),
      h('div', { class: 'modal__actions' }, cancel, confirm),
    ),
  );
  document.body.append(root);
}
