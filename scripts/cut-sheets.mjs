#!/usr/bin/env node
/**
 * 캐릭터 시트(assets/sheets/<id>.png, 1024x1536)를 잘라 assets/characters/<id>/ 에 저장한다.
 *
 * 시트 레이아웃
 *   - 왼쪽 절반: 전신 스탠딩            → full.png
 *   - 오른쪽 위: 표정 6개 (2열 3행)      → neutral, smile / angry, sad / surprised, blush
 *   - 오른쪽 아래: SD                    → sd.png
 *
 * 처리 순서
 *   1. 시트 바깥 테두리와 이어진 흰 배경을 투명으로 바꾼다.
 *      (머리카락의 흰 하이라이트는 테두리와 이어져 있지 않으므로 남는다)
 *   2. 타일 위치가 시트마다 조금씩 달라서 좌표를 고정하지 않고,
 *      알파 채널의 연결 영역(connected component)으로 조각을 찾는다.
 *   3. 왼쪽 → 전신, 오른쪽 위 큰 조각 6개 → 표정, 오른쪽 아래 → SD 로 분류해 저장한다.
 *
 * 사용법: npm run cut-sheets [-- <id> ...]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHEET_DIR = path.join(ROOT, 'assets/sheets');
const OUT_DIR = path.join(ROOT, 'assets/characters');

const EXPRESSIONS = ['neutral', 'smile', 'angry', 'sad', 'surprised', 'blush'];

/** 왼쪽(전신)과 오른쪽(표정·SD)을 나누는 x 비율 */
const SPLIT_X = 0.44;
/** 오른쪽 영역에서 표정 그리드와 SD를 나누는 y 비율 */
const SPLIT_Y = 0.71;
/** 조각을 찾을 때 이 값보다 알파가 큰 픽셀만 본다 (반투명 글로우끼리 조각이 이어지지 않게) */
const ALPHA_STRONG = 128;
/** 트리밍할 때 이 값 이하의 알파는 빈 픽셀로 본다 */
const ALPHA_ON = 8;
/** 조각 둘레의 반투명 글로우를 얼마나 포함할지(px) */
const HALO = 16;
/** 흰 배경 판정: RGB 최소값이 이 이상이고 */
const WHITE_MIN = 236;
/** 채도(최대-최소)가 이 이하인 픽셀 */
const WHITE_MAX_SPREAD = 16;
/** 잘라낸 이미지 둘레 여백(px) */
const PAD = 4;

async function main() {
  const only = process.argv.slice(2);
  const files = (await fs.readdir(SHEET_DIR)).filter((f) => f.endsWith('.png')).sort();
  if (files.length === 0) throw new Error(`${SHEET_DIR}에 시트가 없습니다`);

  const done = [];
  for (const file of files) {
    const id = path.basename(file, '.png');
    if (only.length && !only.includes(id)) continue;
    await cutSheet(id, path.join(SHEET_DIR, file));
    done.push(id);
  }
  console.log('완료:', done.join(', '));
}

async function cutSheet(id, file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data, w: info.width, h: info.height };
  const cleared = removeWhiteBackground(img);

  const splitX = Math.round(img.w * SPLIT_X);
  const splitY = Math.round(img.h * SPLIT_Y);
  const { comps, label } = labelComponents(img);
  const full = [];
  const grid = [];
  const sd = [];
  for (const c of comps) {
    const cx = (c.x0 + c.x1) / 2;
    const cy = (c.y0 + c.y1) / 2;
    if (cx < splitX) full.push(c);
    else if (cy < splitY) grid.push(c);
    else sd.push(c);
  }

  // 표정 타일: 그리드 영역에서 가장 큰 6개. 나머지 작은 조각(♪ 같은 장식)은 버린다.
  const tiles = [...grid].sort((a, b) => b.area - a.area).slice(0, 6);
  if (tiles.length !== 6) throw new Error(`${id}: 표정 타일을 6개 찾지 못했습니다 (${tiles.length}개)`);
  // 위→아래 3행, 각 행은 왼→오른쪽
  tiles.sort((a, b) => a.y0 - b.y0);
  const ordered = [];
  for (let r = 0; r < 3; r++) ordered.push(...tiles.slice(r * 2, r * 2 + 2).sort((a, b) => a.x0 - b.x0));
  if (full.length === 0 || sd.length === 0) throw new Error(`${id}: 전신 또는 SD를 찾지 못했습니다`);

  const outDir = path.join(OUT_DIR, id);
  await fs.mkdir(outDir, { recursive: true });

  const tileBoxes = ordered.map((t) => bboxOf([t]));
  const fullBox = bboxOf(full);
  const sdBox = bboxOf(sd);
  await writePng(padTo(extract(img, label, full, [...tileBoxes, sdBox])), path.join(outDir, 'full.png'));
  await writePng(padTo(extract(img, label, sd, [...tileBoxes, fullBox])), path.join(outDir, 'sd.png'));

  // 표정 6장은 대화창에서 흔들리지 않게 같은 크기(가로 가운데·아래 정렬)로 맞춘다.
  const faces = ordered.map((tile, i) =>
    extract(img, label, [tile], [...tileBoxes.filter((_, j) => j !== i), fullBox, sdBox]),
  );
  const fw = Math.max(...faces.map((f) => f.w));
  const fh = Math.max(...faces.map((f) => f.h));
  for (let i = 0; i < 6; i++) {
    await writePng(padTo(faces[i], fw, fh), path.join(outDir, `${EXPRESSIONS[i]}.png`));
  }

  const pct = ((cleared / (img.w * img.h)) * 100).toFixed(1);
  console.log(`${id}: 흰 배경 ${pct}% 제거, 전신 ${size(fullBox)}, SD ${size(sdBox)}, 표정 ${fw}x${fh}`);
}

// ───────────── 흰 배경 제거 ─────────────

/**
 * 시트 바깥 테두리에서 시작해, 흰색에 가까운 픽셀을 따라 flood fill 해서 투명하게 만든다.
 * 지워진 영역과 맞닿은 픽셀은 흰색이 섞인 만큼 반투명으로 바꾸고 색을 되돌려 흰 테두리를 없앤다.
 * 반환값: 지운 픽셀 수
 */
function removeWhiteBackground({ data, w, h }) {
  const isWhite = (p) => {
    const i = p * 4;
    if (data[i + 3] === 0) return true; // 이미 투명한 곳도 배경으로 이어지게 통과
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const min = Math.min(r, g, b);
    return min >= WHITE_MIN && Math.max(r, g, b) - min <= WHITE_MAX_SPREAD;
  };

  // 이미 배경이 투명한 시트(테두리가 대부분 투명)는 건드리지 않는다.
  // 투명 영역을 타고 흰 옷·은발까지 지워지는 것을 막기 위해서다.
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const opaqueWhite = border.filter((p) => data[p * 4 + 3] > 250 && isWhite(p)).length;
  if (opaqueWhite < border.length * 0.5) return 0;

  const removed = new Uint8Array(w * h);
  const stack = [];
  const seed = (p) => {
    if (!removed[p] && isWhite(p)) { removed[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }

  let count = 0;
  for (let p = 0; p < w * h; p++) {
    if (!removed[p]) continue;
    if (data[p * 4 + 3] > 0) count++;
    data[p * 4 + 3] = 0;
  }
  // 경계 픽셀 안티앨리어싱
  const edge = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (removed[p] || data[p * 4 + 3] === 0) continue;
      if ((x > 0 && removed[p - 1]) || (x < w - 1 && removed[p + 1]) || (y > 0 && removed[p - w]) || (y < h - 1 && removed[p + w])) {
        edge.push(p);
      }
    }
  }
  for (const p of edge) {
    const i = p * 4;
    // 흰색과 가까울수록 투명하게: 가장 어두운 채널 기준으로 흰색 비율을 추정
    const whiteness = Math.min(data[i], data[i + 1], data[i + 2]) / 255;
    const a = Math.min(1, Math.max(0.2, (1 - whiteness) * 3));
    for (let ch = 0; ch < 3; ch++) {
      data[i + ch] = Math.max(0, Math.min(255, Math.round((data[i + ch] - 255 * (1 - a)) / a)));
    }
    data[i + 3] = Math.round(data[i + 3] * a);
  }
  return count;
}

// ───────────── 연결 영역 ─────────────

function labelComponents({ data, w, h }) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] <= ALPHA_STRONG) continue;
    const c = { id: comps.length, x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    let sp = 0;
    stack[sp++] = start;
    label[start] = c.id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p / w) | 0;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (label[q] === -1 && data[q * 4 + 3] > ALPHA_STRONG) {
            label[q] = c.id;
            stack[sp++] = q;
          }
        }
      }
    }
    comps.push(c);
  }
  return { comps, label };
}

const bboxOf = (pieces) => ({
  x0: Math.min(...pieces.map((p) => p.x0)),
  y0: Math.min(...pieces.map((p) => p.y0)),
  x1: Math.max(...pieces.map((p) => p.x1)),
  y1: Math.max(...pieces.map((p) => p.y1)),
});

const size = (b) => `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`;

/**
 * 주어진 조각들을 잘라낸다. 조각 둘레 HALO px 안의 반투명 픽셀(글로우)도 포함하되,
 * 다른 그룹(exclude) 영역에 속한 픽셀은 넣지 않는다.
 */
function extract(img, label, pieces, exclude) {
  const ids = new Set(pieces.map((p) => p.id));
  const b = bboxOf(pieces);
  const x0 = Math.max(0, b.x0 - HALO);
  const y0 = Math.max(0, b.y0 - HALO);
  const x1 = Math.min(img.w - 1, b.x1 + HALO);
  const y1 = Math.min(img.h - 1, b.y1 + HALO);
  const inExcluded = (x, y) => exclude.some((e) => x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + x0;
      const sy = y + y0;
      const sp = sy * img.w + sx;
      const l = label[sp];
      if (l === -1 ? !inExcluded(sx, sy) : ids.has(l)) img.data.copy(out, (y * w + x) * 4, sp * 4, sp * 4 + 4);
    }
  }
  return trim({ data: out, w, h });
}

// ───────────── 이미지 유틸 ─────────────

/** 투명 테두리를 잘라낸다 */
function trim(img) {
  const { data, w, h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_ON) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img;
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) data.copy(out, y * nw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4);
  return { data: out, w: nw, h: nh };
}

/** 여백을 붙이고, 크기가 주어지면 가로 가운데·아래 정렬로 맞춘다 */
function padTo(img, tw = img.w, th = img.h) {
  const w = tw + PAD * 2;
  const h = th + PAD * 2;
  const ox = Math.floor((w - img.w) / 2);
  const oy = h - PAD - img.h;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < img.h; y++) img.data.copy(out, ((y + oy) * w + ox) * 4, y * img.w * 4, (y + 1) * img.w * 4);
  return { data: out, w, h };
}

function writePng(img, file) {
  return sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(file);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
