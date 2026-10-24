import { h, onTap } from './dom';

export interface TabDef {
  id: string;
  label: string;
  icon: string; // SVG path data
}

/** 화면 아래 탭 바 */
export function createTabs(tabs: TabDef[], onChange: (id: string) => void) {
  const buttons = new Map<string, HTMLButtonElement>();
  const el = h('nav', { class: 'tabs', role: 'tablist' });
  for (const tab of tabs) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', tab.icon);
    svg.append(path);
    const btn = h('button', { class: 'tabs__btn', type: 'button', role: 'tab', 'data-tab': tab.id }, svg, h('span', {}, tab.label), h('i', { class: 'tabs__dot', hidden: true }));
    onTap(btn, () => onChange(tab.id));
    buttons.set(tab.id, btn);
    el.append(btn);
  }
  return {
    el,
    select(id: string) {
      for (const [tabId, btn] of buttons) {
        btn.classList.toggle('is-active', tabId === id);
        btn.setAttribute('aria-selected', String(tabId === id));
      }
    },
    /** 탭 위 작은 점 (예: 뽑기 가능) */
    setDot(id: string, on: boolean) {
      const dot = buttons.get(id)?.querySelector<HTMLElement>('.tabs__dot');
      if (dot && dot.hidden === on) dot.hidden = !on;
    },
  };
}

export const ICONS = {
  // 라디오
  studio: 'M4 9h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm3 2.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM13 12h5v1.5h-5zm0 3h5v1.5h-5zM6 8l9-4 .6 1.4L9.5 8z',
  // 엽서(봉투)
  gacha: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm1.2 1.8L12 13l7.8-5.2-.8-1.2L12 11.2 5 6.6z',
  // 책
  collection: 'M5 3h11a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1zm2 14a1 1 0 0 0 0 2h10v-2zm2-11v2h7V6z',
};
