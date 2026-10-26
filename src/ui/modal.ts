import { h, onTap } from './dom';

export interface ModalConfig {
  title: string;
  body: Node;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  /** 취소 버튼을 눌렀을 때 (창은 항상 닫힌다) */
  onCancel?: () => void;
  /** 넓은 창 (확률표, 카드 상세) */
  wide?: boolean;
  /** 패널에 붙일 추가 클래스 */
  panelClass?: string;
  /** 확인 버튼을 눈에 덜 띄게 (본문에 주 버튼이 따로 있을 때) */
  confirmGhost?: boolean;
}

/** 가운데 뜨는 알림/확인 창 */
export function openModal(config: ModalConfig): void {
  document.getElementById('modal')?.remove();
  const close = () => document.getElementById('modal')?.remove();

  const confirm = h('button', { class: `btn ${config.confirmGhost ? 'btn--ghost' : 'btn--primary'}`, type: 'button' }, config.confirmLabel ?? '확인');
  onTap(confirm, () => {
    close();
    config.onConfirm?.();
  });

  let cancel: HTMLElement | null = null;
  if (config.cancelLabel) {
    cancel = h('button', { class: 'btn btn--ghost', type: 'button' }, config.cancelLabel);
    onTap(cancel, () => {
      close();
      config.onCancel?.();
    });
  }

  const root = h(
    'div',
    { class: 'modal', id: 'modal' },
    h(
      'div',
      { class: `modal__panel${config.wide ? ' modal__panel--wide' : ''}${config.panelClass ? ` ${config.panelClass}` : ''}`, role: 'dialog', 'aria-modal': 'true' },
      h('h2', { class: 'modal__title' }, config.title),
      h('div', { class: 'modal__body' }, config.body),
      h('div', { class: 'modal__actions' }, cancel, confirm),
    ),
  );
  document.body.append(root);
  // 내용이 길어 스크롤되면 아래쪽을 흐리게 (끝까지 내리면 지운다)
  const body = root.querySelector('.modal__body') as HTMLElement;
  const fade = () => {
    const scrollable = body.scrollHeight > body.clientHeight + 2;
    body.classList.toggle('is-scrollable', scrollable);
    body.classList.toggle('is-end', scrollable && body.scrollTop + body.clientHeight >= body.scrollHeight - 4);
  };
  body.addEventListener('scroll', fade, { passive: true });
  new ResizeObserver(fade).observe(body);
  requestAnimationFrame(fade);
}
