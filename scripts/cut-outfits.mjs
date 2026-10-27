#!/usr/bin/env node
/**
 * 시즌 의상 이미지 정리 (할로윈 등). 원본은 assets/stand/<시즌>/ 에 두고, 결과는 assets/characters/<부원>/<의상>/ 에.
 *
 * - 전신(full)·SD·재화 아이콘: 흰 배경(과 반투명 빛번짐)을 투명하게, 빈 여백을 잘라 저장
 * - 표정 시트(가로 cols × 세로 rows): 칸마다 잘라 stand_<표정>.png
 *     · 칸 경계는 같은 간격이 아니라, 이웃한 두 그림 사이에서 그림이 가장 적게 지나가는 줄에서 자른다
 *       (후드 끝·날개가 옆 칸으로 넘어와도 잘리지 않게)
 *     · 얼굴 크기 맞추기: 시트마다 '그림 맨 위(모자·후드 끝)에서 턱까지' 거리와 확대 배율을 적어 두면,
 *       결과에서 머리 높이가 기존 스탠딩(HEAD_PX)과 같아진다
 *     · bottom: 'content'면 그림 끝까지, 숫자면 그림 맨 위에서 그만큼(원본 px)까지만 (예: 무릎 위)
 *     · 얼굴 타일(neutral.png 등)도 스탠딩에서 얼굴 부분을 잘라 만든다 (카드 목록·대화창용)
 * - 스탠딩이 모자·후드 때문에 머리 위로 길어지므로, 머리 끝 위치를 src/data/standMeta.json에 적어
 *   스토리 화면이 기존 스탠딩과 같은 높이에 얼굴을 맞춘다
 *
 * 사용법: node scripts/cut-outfits.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { alphaBox, keyOut } from './lib/keyout.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HEAD_PX = 200;
const PAD = 6;

const SEASONS = {
  halloween: {
    src: 'assets/stand/halloween',
    files: [
      ['seoyun_halloween_full.jpg', 'assets/characters/seoyun/halloween/full.png'],
      // 미래 전신·SD는 원본이 이미 투명 배경 → 반투명 빛번짐만 지우고 흰색(유령 망토)은 건드리지 않는다
      ['mirae_halloween_full.png', 'assets/characters/mirae/halloween/full.png', { key: { whiteMin: 256 } }],
      ['seoyun_halloween_sd.jpg', 'assets/characters/seoyun/halloween/sd.png'],
      ['mirae_halloween_sd.png', 'assets/characters/mirae/halloween/sd.png', { key: { whiteMin: 256 } }],
      ['candy_u.jpg', 'assets/ui/candy_u.png', { height: 160 }],
    ],
    sheets: [
      {
        key: 'seoyun/halloween',
        file: 'seoyun_halloween_faces.png',
        grid: [3, 2],
        order: ['neutral', 'smile', 'angry', 'sad', 'surprised', 'blush'],
        // 모자 끝 → 턱 219px. 눈 사이 거리·눈~턱 거리가 이전 시트와 같아 배율도 그대로 ×1.43
        chinFromTop: 219,
        scale: 1.43,
        bottom: 'content',
        faceX: 162,
        // 원본이 이미 투명 배경 → 흰색(스타킹·머리카락)은 건드리지 않고 반투명 잔여물만 지운다
        keying: { whiteMin: 256 },
      },
      {
        key: 'mirae/halloween',
        file: 'mirae_halloween_faces.png',
        grid: [3, 2],
        order: ['neutral', 'smile', 'angry', 'sad', 'surprised', 'blush'],
        // 후드 끝 → 턱 135px. 신발까지 그린 전신이라 무릎 위(후드 끝에서 430px)까지만,
        // 눈 사이·눈~턱 거리를 기본 스탠딩에 맞춰 ×1.85
        chinFromTop: 135,
        scale: 1.85,
        bottom: 430,
        faceX: 178,
        // 원본이 이미 투명 배경 → 흰 유령 망토는 건드리지 않고 반투명 잔여물만 지운다
        keying: { whiteMin: 256 },
      },
    ],
  },
};

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const raw = (img) => ({ raw: { width: img.w, height: img.h, channels: 4 } });

/** 축 방향으로 그림이 가장 적게 지나가는 줄 (n칸으로 나눌 경계 n-1개) */
function splits(img, n, axis) {
  const len = axis === 'x' ? img.w : img.h;
  const other = axis === 'x' ? img.h : img.w;
  const cov = new Float64Array(len);
  for (let a = 0; a < len; a++)
    for (let b = 0; b < other; b++) {
      const [x, y] = axis === 'x' ? [a, b] : [b, a];
      if (img.data[(y * img.w + x) * 4 + 3] > 8) cov[a]++;
    }
  const out = [0];
  for (let k = 1; k < n; k++) {
    const guess = (k * len) / n;
    const span = len / (n * 3);
    let best = Math.round(guess);
    for (let a = Math.round(guess - span); a <= Math.round(guess + span); a++)
      if (cov[a] < cov[best] || (cov[a] === cov[best] && Math.abs(a - guess) < Math.abs(best - guess))) best = a;
    out.push(best);
  }
  out.push(len);
  return out;
}

/** 칸 안에서 가장 큰 덩어리와 이어지지 않은 채 칸 가장자리에 닿은 조각(옆 그림)을 지운다 */
function isolate(img, x0, x1, y0, y1) {
  const cw = x1 - x0;
  const ch = y1 - y0;
  const label = new Int32Array(cw * ch).fill(-1);
  const comps = [];
  for (let s = 0; s < cw * ch; s++) {
    if (label[s] !== -1) continue;
    const sx = s % cw, sy = (s / cw) | 0;
    if (img.data[((sy + y0) * img.w + sx + x0) * 4 + 3] <= 8) continue;
    const comp = { size: 0, edge: false, px: [] };
    const st = [s];
    label[s] = comps.length;
    while (st.length) {
      const i = st.pop();
      comp.size++;
      comp.px.push(i);
      const x = i % cw, y = (i / cw) | 0;
      if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) comp.edge = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const ni = ny * cw + nx;
          if (label[ni] !== -1 || img.data[((ny + y0) * img.w + nx + x0) * 4 + 3] <= 8) continue;
          label[ni] = comps.length;
          st.push(ni);
        }
    }
    comps.push(comp);
  }
  const main = comps.reduce((a, b) => (b.size > a.size ? b : a), comps[0]);
  for (const c of comps) {
    if (c === main || (!c.edge && c.size >= 60)) continue;
    for (const i of c.px) img.data[(((i / cw) | 0) + y0) * img.w * 4 + ((i % cw) + x0) * 4 + 3] = 0;
  }
}

async function cleanCopy(src, out, opts = {}) {
  const img = await load(src);
  keyOut(img.data, img.w, img.h, opts.key);
  const box = alphaBox(img.data, img.w, img.h, 0, img.w);
  const left = Math.max(0, box.left - PAD), top = Math.max(0, box.top - PAD);
  const right = Math.min(img.w - 1, box.right + PAD), bottom = Math.min(img.h - 1, box.bottom + PAD);
  let s = sharp(img.data, raw(img)).extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
  if (opts.height) s = s.resize({ height: opts.height, kernel: 'lanczos3' });
  await fs.mkdir(path.dirname(out), { recursive: true });
  const r = await s.png({ compressionLevel: 9 }).toFile(out);
  console.log(`  ${path.relative(ROOT, out)} ${r.width}×${r.height}`);
}

async function cutSheet(dir, sheet, meta) {
  const img = await load(path.join(dir, sheet.file));
  keyOut(img.data, img.w, img.h, sheet.keying ?? {});
  const [cols, rows] = sheet.grid;
  const xs = splits(img, cols, 'x');
  const ys = splits(img, rows, 'y');
  const outDir = path.join(ROOT, 'assets/characters', sheet.key);
  await fs.mkdir(outDir, { recursive: true });
  const sizes = [];
  let headTop = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const expr = sheet.order[r * cols + c];
      const work = { ...img, data: Buffer.from(img.data) };
      const [x0, x1, y0, y1] = [xs[c], xs[c + 1], ys[r], ys[r + 1]];
      isolate(work, x0, x1, y0, y1);
      const box = alphaBox(work.data, work.w, work.h, x0, x1);
      // alphaBox는 세로 전체를 보므로 이 줄(row) 안으로 다시 좁힌다
      let top = y1, bottom = y0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          if (work.data[(y * work.w + x) * 4 + 3] > 8) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            break;
          }
      const cropTop = Math.max(y0, top - PAD);
      const cropBottom = sheet.bottom === 'content' ? Math.min(y1, bottom + PAD) : Math.min(y1, top + sheet.bottom);
      const left = Math.max(x0, box.left - PAD), right = Math.min(x1 - 1, box.right + PAD);
      const w = right - left + 1, h = cropBottom - cropTop;
      const W = Math.round(w * sheet.scale), H = Math.round(h * sheet.scale);
      const stand = await sharp(work.data, raw(work)).extract({ left, top: cropTop, width: w, height: h }).resize({ width: W, height: H, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
      await fs.writeFile(path.join(outDir, `stand_${expr}.png`), stand);
      sizes.push(`${expr} ${W}×${H}`);
      // 결과 이미지에서 '머리 끝'(기존 스탠딩 기준 머리 높이를 턱에서 뺀 자리)
      const chinOut = (top + sheet.chinFromTop - cropTop) * sheet.scale;
      if (r === 0 && c === 0) headTop = Math.round(chinOut - HEAD_PX);
      // 얼굴 타일: 머리 높이의 1.5배 너비, 기존 타일 비율(300×371)
      const fw = 300, fh = 371;
      const cx = Math.round((x0 + sheet.faceX - left) * sheet.scale);
      const fy = Math.max(0, Math.round(chinOut - HEAD_PX - 30));
      const fl = Math.max(0, Math.min(W - fw, cx - fw / 2));
      await sharp(stand).extract({ left: fl, top: fy, width: Math.min(fw, W), height: Math.min(fh, H - fy) }).png({ compressionLevel: 9 }).toFile(path.join(outDir, `${expr}.png`));
    }
  meta[sheet.key] = { headTop };
  console.log(`  ${sheet.key} (×${sheet.scale}, 자르는 줄 x ${xs.slice(1, -1).join('/')} · y ${ys.slice(1, -1).join('/')}, 머리 끝 ${headTop}px): ${sizes.join(', ')}`);
}

const metaFile = path.join(ROOT, 'src/data/standMeta.json');
const meta = JSON.parse(await fs.readFile(metaFile, 'utf8').catch(() => '{}'));
for (const [name, season] of Object.entries(SEASONS)) {
  console.log(name);
  const dir = path.join(ROOT, season.src);
  for (const [src, out, opts] of season.files) await cleanCopy(path.join(dir, src), path.join(ROOT, out), opts);
  for (const sheet of season.sheets) await cutSheet(dir, sheet, meta);
}
await fs.writeFile(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
