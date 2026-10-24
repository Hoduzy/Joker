type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

/** 간단한 DOM 생성 헬퍼. h('div', { class: 'x' }, '텍스트', child) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** 버튼 탭 처리. 더블탭 확대 방지는 CSS의 touch-action: manipulation이 담당한다. */
export function onTap(el: HTMLElement, handler: () => void): void {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    handler();
  });
}

/** 부원 일러스트 대신 쓰는 색깔 박스 */
export function portrait(color: string, label: string, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const el = h('div', { class: `portrait portrait--${size}` }, label.slice(0, 1));
  el.style.setProperty('--member-color', color);
  return el;
}
