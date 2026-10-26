/**
 * 스토리 스탠딩 확인 페이지 (stands.html).
 * - 부원 × 표정 표: 파일이 없는 표정은 게임에서처럼 neutral로 대신 보여 주고 표시한다
 * - 나란히 보기: 다섯 명을 게임과 같은 비율·아래 정렬로 세워서 얼굴 크기를 비교한다
 */
import { MEMBERS } from './data/members';
import { EXPRESSION_LABELS, STAND_EXPRESSIONS, STAND_REF_HEIGHT, getPortraits, standUrl, type StandExpression } from './data/portraits';
import { h } from './ui/dom';
import './stands.css';

const LABELS: Record<StandExpression, string> = { ...EXPRESSION_LABELS, smile2: '활짝 웃음' };
const BGS = [
  { id: 'checker', label: '체크무늬' },
  { id: 'dark', label: '어두운 배경' },
  { id: 'scene', label: '방송실 배경' },
  { id: 'green', label: '초록 (경계 확인)' },
] as const;

const root = document.getElementById('stands')!;

function cell(memberId: string, expr: StandExpression): HTMLElement {
  const { url, fallback, cropped } = standUrl(memberId, expr);
  const own = getPortraits(memberId)?.stands[expr];
  const img = url ? h('img', { src: url, alt: `${memberId} ${expr}`, loading: 'lazy' }) : h('span', { class: 'none' }, '없음');
  const size = h('small', {});
  if (url) img.addEventListener('load', () => (size.textContent = `${(img as HTMLImageElement).naturalWidth}×${(img as HTMLImageElement).naturalHeight}`));
  const note = !cropped ? '스탠딩 없음 → 전신' : fallback ? 'neutral로 대체' : own ? '' : '';
  return h('td', { class: fallback ? 'is-fallback' : '' }, h('a', { href: url ?? '#', target: '_blank', rel: 'noopener', class: 'thumb' }, img), note ? h('em', {}, note) : size);
}

function lineup(): HTMLElement {
  // 게임과 같은 방식: 기준 높이(STAND_REF_HEIGHT) 대비 원본 높이만큼, 아래에 붙여서
  const row = h('div', { class: 'lineup' });
  for (const m of MEMBERS) {
    const { url } = standUrl(m.id, 'neutral');
    if (!url) continue;
    const img = h('img', { src: url, alt: m.name });
    img.addEventListener('load', () => (img.style.height = `${(img.naturalHeight / STAND_REF_HEIGHT) * 100}%`));
    row.append(h('figure', {}, img, h('figcaption', {}, m.name)));
  }
  return row;
}

function render() {
  const toolbar = h('div', { class: 'toolbar' });
  for (const bg of BGS) {
    const b = h('button', { type: 'button', 'data-bg': bg.id }, bg.label);
    b.addEventListener('click', () => setBg(bg.id));
    toolbar.append(b);
  }
  const table = h(
    'table',
    { class: 'grid' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), ...STAND_EXPRESSIONS.map((e) => h('th', {}, e, h('br'), h('small', {}, LABELS[e]))))),
    h('tbody', {}, ...MEMBERS.map((m) => h('tr', {}, h('th', {}, m.name, h('br'), h('code', {}, m.id)), ...STAND_EXPRESSIONS.map((e) => cell(m.id, e))))),
  );
  root.replaceChildren(
    h(
      'header',
      { class: 'top' },
      h('div', {}, h('h1', {}, '스탠딩 미리보기'), h('p', {}, 'assets/characters/<부원>/stand_<표정>.png · 노란 칸은 파일이 없어서 neutral로 대신 나오는 표정 · npm run cut-stands로 다시 만들 수 있어요')),
      h('div', { class: 'links' }, h('a', { href: './preview.html' }, '캐릭터 이미지'), h('a', { href: './' }, '← 게임으로')),
    ),
    toolbar,
    h('section', {}, h('h2', {}, '나란히 보기 (게임과 같은 비율)'), lineup()),
    h('section', {}, h('h2', {}, '부원 × 표정'), h('div', { class: 'scroll' }, table)),
  );
  setBg('checker');
}

function setBg(id: string) {
  document.body.dataset.bg = id;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.toolbar button')) b.classList.toggle('is-active', b.dataset.bg === id);
}

render();
