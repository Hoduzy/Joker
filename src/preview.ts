/**
 * 시트에서 잘라낸 캐릭터 이미지를 확인하는 페이지 (preview.html).
 * 배경을 바꿔 가며 투명 처리와 가장자리 상태를 볼 수 있다.
 */
import { getMember } from './data/members';
import { EXPRESSION_LABELS, EXPRESSIONS, getPortraits, portraitIds } from './data/portraits';
import { h } from './ui/dom';
import './preview.css';

const BACKGROUNDS = [
  { id: 'checker', label: '체크무늬' },
  { id: 'dark', label: '어두운 배경' },
  { id: 'light', label: '밝은 배경' },
  { id: 'green', label: '초록 (경계 확인용)' },
] as const;

const root = document.getElementById('preview')!;

function figure(label: string, url: string | undefined, kind: 'full' | 'sd' | 'face'): HTMLElement {
  if (!url) return h('figure', { class: `card card--${kind} card--missing` }, h('div', { class: 'card__img' }, '없음'), h('figcaption', {}, label));
  const size = h('span', { class: 'card__size' });
  const img = h('img', { src: url, alt: label, loading: 'lazy' });
  img.addEventListener('load', () => (size.textContent = `${img.naturalWidth}×${img.naturalHeight}`));
  const link = h('a', { class: 'card__img', href: url, target: '_blank', rel: 'noopener' }, img);
  return h('figure', { class: `card card--${kind}` }, link, h('figcaption', {}, label, size));
}

function render() {
  const ids = portraitIds();
  const toolbar = h('div', { class: 'toolbar' });
  for (const bg of BACKGROUNDS) {
    const btn = h('button', { type: 'button', 'data-bg': bg.id }, bg.label);
    btn.addEventListener('click', () => setBg(bg.id));
    toolbar.append(btn);
  }

  const sections = ids.map((id) => {
    const set = getPortraits(id)!;
    const member = getMember(id);
    return h(
      'section',
      { class: 'char' },
      h('h2', {}, member ? `${member.name} ` : '', h('code', {}, id), member ? h('span', { class: 'char__tag' }, member.tagline) : null),
      h(
        'div',
        { class: 'char__row' },
        figure('full', set.full, 'full'),
        figure('sd', set.sd, 'sd'),
        h('div', { class: 'faces' }, ...EXPRESSIONS.map((e) => figure(`${e} · ${EXPRESSION_LABELS[e]}`, set.faces[e], 'face'))),
      ),
    );
  });

  root.replaceChildren(
    h(
      'header',
      { class: 'top' },
      h('div', {}, h('h1', {}, '캐릭터 이미지 미리보기'), h('p', {}, `assets/characters · ${ids.length}명 · 이미지를 탭하면 원본 크기로 열려요`)),
      h('span', {}, h('a', { class: 'back', href: './stands.html' }, '스탠딩'), ' ', h('a', { class: 'back', href: './' }, '← 게임으로')),
    ),
    toolbar,
    ...sections,
  );
}

function setBg(id: string) {
  document.body.dataset.bg = id;
  document.querySelectorAll<HTMLButtonElement>('.toolbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.bg === id));
  try {
    localStorage.setItem('preview-bg', id);
  } catch {
    // 무시
  }
}

render();
let saved = 'checker';
try {
  saved = localStorage.getItem('preview-bg') ?? saved;
} catch {
  // 무시
}
setBg(saved);
