#!/usr/bin/env node
/**
 * 스토리용 스탠딩 이미지(assets/characters/<id>/stand_<표정>.png)의 배경을 투명하게 만든다.
 * 이미 투명한 파일은 그대로 두므로 여러 번 돌려도 된다.
 *
 * 처리
 *   1. 이미지 테두리와 이어진 '배경' 픽셀을 지운다.
 *      배경 = 거의 흰색(흰 배경) 이거나 반투명(이미 대충 지운 배경의 뿌연 잔여물)
 *      → 테두리와 이어져 있지 않은 흰 셔츠·머리 하이라이트는 남는다
 *   2. 남은 조각 중 작은 부스러기를 지운다
 *   3. 남은 그림의 바깥 1px은 반투명으로 (흰 테두리 줄이기), 투명한 둘레를 잘라낸다
 *
 * 사용법: npm run stands [-- <id> ...]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'assets/characters');

/** 흰 배경 판정: RGB 최소값이 이 이상이고 채도(최대-최소)가 이 이하 */
const WHITE_MIN = 238;
const WHITE_MAX_SPREAD = 16;
/** 이 알파보다 낮으면 배경 잔여물로 본다 */
const ALPHA_SOLID = 140;
/** 전체 그림 대비 이 비율보다 작은 조각은 지운다 */
const SPECK_RATIO = 0.002;
const EDGE_ALPHA = 170;

async function processFile(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const isBg = (i) => {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a < ALPHA_SOLID) return true;
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    return mn >= WHITE_MIN && mx - mn <= WHITE_MAX_SPREAD;
  };

  // 1. 테두리에서 배경 채우기
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (i) => {
    if (!bg[i] && isBg(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }

  // 2. 남은 조각 라벨링 → 작은 조각 지우기
  const label = new Int32Array(n);
  const sizes = [0];
  let total = 0;
  for (let s = 0; s < n; s++) {
    if (bg[s] || label[s]) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w;
      const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of near) if (j >= 0 && j < n && !bg[j] && !label[j]) (label[j] = id), stack.push(j);
    }
    sizes.push(size);
    total += size;
  }
  for (let i = 0; i < n; i++) if (!bg[i] && sizes[label[i]] < total * SPECK_RATIO) bg[i] = 1;

  // 3. 알파 적용 (바깥 1px은 반투명)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (bg[i]) {
      data[o + 3] = 0;
      continue;
    }
    const x = i % w, y = (i / w) | 0;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < n - w && bg[i + w]);
    if (edge) data[o + 3] = Math.min(data[o + 3], EDGE_ALPHA);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error(`${file}: 남는 그림이 없습니다`);
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png({ compressionLevel: 9 })
    .toFile(file + '.tmp');
  await fs.rename(file + '.tmp', file);
  return `${x1 - x0 + 1}×${y1 - y0 + 1}`;
}

async function main() {
  const only = process.argv.slice(2);
  const ids = (await fs.readdir(DIR)).filter((d) => !only.length || only.includes(d)).sort();
  let count = 0;
  for (const id of ids) {
    const dir = path.join(DIR, id);
    if (!(await fs.stat(dir)).isDirectory()) continue;
    for (const f of (await fs.readdir(dir)).filter((f) => /^stand_\w+\.png$/.test(f)).sort()) {
      const size = await processFile(path.join(dir, f));
      console.log(`${id}/${f} → ${size}`);
      count++;
    }
  }
  if (!count) console.log('stand_*.png 파일이 없습니다');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
