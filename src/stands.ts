/**
 * 스토리 스탠딩 확인 페이지 (stands.html).
 * - 부원 × 표정 표: 파일이 없는 표정은 게임에서처럼 neutral로 대신 보여 주고 표시한다
 * - 나란히 보기: 다섯 명을 게임과 같은 비율·아래 정렬로 세워서 얼굴 크기를 비교한다
 * - 시즌 의상(예: seoyun/halloween): 기본 모습 옆에 세워 얼굴 크기·높이를 비교하고, 전신·SD도 보여 준다
 */
import { MEMBERS } from './data/members';
import { EXPRESSION_LABELS, STAND_EXPRESSIONS, STAND_HEAD_TOP, STAND_REF_HEIGHT, getPortraits, portraitIds, standUrl, type StandExpression } from './data/portraits';
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

/** 시즌 의상 (assets/characters/<부원>/<의상>/) 중 스탠딩이 있는 것 */
const OUTFITS = portraitIds().filter((id) => id.includes('/') && Object.keys(getPortraits(id)?.stands ?? {}).length);
const nameOf = (id: string) => {
  const [member, outfit] = id.split('/');
  const m = MEMBERS.find((x) => x.id === member);
  return outfit ? `${m?.name ?? member} (${outfit})` : (m?.name ?? id);
};

function cell(id: string, expr: StandExpression): HTMLElement {
  const { url, fallback, cropped } = standUrl(id, expr);
  const img = url ? h('img', { src: url, alt: `${id} ${expr}`, loading: 'lazy' }) : h('span', { class: 'none' }, '없음');
  const size = h('small', {});
  if (url) img.addEventListener('load', () => (size.textContent = `${(img as HTMLImageElement).naturalWidth}×${(img as HTMLImageElement).naturalHeight}`));
  const note = !cropped ? '스탠딩 없음 → 전신' : fallback ? 'neutral로 대체' : '';
  return h('td', { class: fallback ? 'is-fallback' : '' }, h('a', { href: url ?? '#', target: '_blank', rel: 'noopener', class: 'thumb' }, img), note ? h('em', {}, note) : size);
}

/** 게임(vn.ts)과 같은 방식으로 세운다: 기준 높이 대비 원본 높이, 머리 위로 긴 의상은 머리 끝을 맞춰 아래로 내린다 */
function standFigure(id: string): HTMLElement | null {
  const { url, headTop } = standUrl(id, 'neutral');
  if (!url) return null;
  const img = h('img', { src: url, alt: nameOf(id) });
  img.addEventListener('load', () => {
    const n = img.naturalHeight;
    img.style.height = `${(n / STAND_REF_HEIGHT) * 100}%`;
    if (headTop !== undefined) {
      img.style.position = 'relative';
      img.style.bottom = `${((STAND_REF_HEIGHT - STAND_HEAD_TOP + headTop - n) / STAND_REF_HEIGHT) * 100}%`;
    }
  });
  return h('figure', {}, img, h('figcaption', {}, nameOf(id)));
}

function lineup(): HTMLElement {
  const row = h('div', { class: 'lineup' });
  for (const m of MEMBERS) {
    const f = standFigure(m.id);
    if (f) row.append(f);
  }
  return row;
}

/** 의상 비교: 기본 모습 옆에 시즌 의상 */
function outfitLineup(): HTMLElement {
  const row = h('div', { class: 'lineup' });
  for (const id of OUTFITS) for (const f of [standFigure(id.split('/')[0]), standFigure(id)]) if (f) row.append(f);
  return row;
}

/** 의상의 전신(카드 그림)·SD(방송 슬롯) */
function outfitArt(): HTMLElement {
  return h(
    'div',
    { class: 'outfit-art' },
    ...OUTFITS.flatMap((id) => {
      const p = getPortraits(id);
      return [
        ['full', p?.full],
        ['sd', p?.sd],
      ]
        .filter((x): x is [string, string] => !!x[1])
        .map(([kind, u]) => h('figure', {}, h('a', { href: u, target: '_blank', rel: 'noopener', class: 'thumb' }, h('img', { src: u, alt: '' })), h('figcaption', {}, `${nameOf(id)} · ${kind}`)));
    }),
  );
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
    h('tbody', {}, ...[...MEMBERS.map((m) => m.id), ...OUTFITS].map((id) => h('tr', {}, h('th', {}, nameOf(id), h('br'), h('code', {}, id)), ...STAND_EXPRESSIONS.map((e) => cell(id, e))))),
  );
  root.replaceChildren(
    h(
      'header',
      { class: 'top' },
      h('div', {}, h('h1', {}, '스탠딩 미리보기'), h('p', {}, 'assets/characters/<부원>/stand_<표정>.png · 노란 칸은 파일이 없어서 neutral로 대신 나오는 표정 · npm run cut-stands / cut-outfits로 다시 만들 수 있어요')),
      h('div', { class: 'links' }, h('a', { href: './preview.html' }, '캐릭터 이미지'), h('a', { href: './' }, '← 게임으로')),
    ),
    toolbar,
    h('section', {}, h('h2', {}, '나란히 보기 (게임과 같은 비율)'), lineup()),
    ...(OUTFITS.length ? [h('section', {}, h('h2', {}, '시즌 의상 비교 (기본 ↔ 의상, 게임과 같은 높이)'), outfitLineup())] : []),
    h('section', {}, h('h2', {}, '부원 × 표정'), h('div', { class: 'scroll' }, table)),
    ...(OUTFITS.length ? [h('section', {}, h('h2', {}, '시즌 의상 전신·SD (카드 그림·방송 슬롯)'), outfitArt())] : []),
  );
  setBg('checker');
}

function setBg(id: string) {
  document.body.dataset.bg = id;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.toolbar button')) b.classList.toggle('is-active', b.dataset.bg === id);
}

render();
