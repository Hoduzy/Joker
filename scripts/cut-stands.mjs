#!/usr/bin/env node
/**
 * 표정 스탠딩 시트(assets/stand/<부원>.png, 가로 6칸·같은 너비)를 잘라
 * assets/characters/<부원>/stand_<표정>.png 로 저장한다.
 *
 * - 흰 배경·체크무늬(반투명 잔여물)는 투명하게 (lib/keyout.mjs)
 * - 구도 맞추기: 시트마다 전신/허벅지로 구도가 달라서, 부원마다 첫 칸 기준
 *   '머리 끝(head[0])'과 '턱(head[1])' 위치를 적어 두고
 *     · 머리 높이(턱 - 머리 끝)가 HEAD_PX가 되게 확대·축소하고
 *     · 머리 끝부터 머리 높이 × BODY_HEADS(≈ 허리 아래)까지만 남긴다
 *   그러면 다섯 명 얼굴 크기가 같아지고, 그림이 허리보다 짧은 시트는 그만큼 짧은 이미지가 된다.
 *   (화면에서는 아래에 붙여 띄우므로 짧은 그림은 자연스럽게 화면 아래에서 올라온다)
 * - 칸 순서는 시트마다 다르다(ORDER). 없는 표정은 alias로 다른 칸을 복사하거나, 게임에서 neutral로 대신 나온다
 * - split: 'auto' — 인물이 칸 경계를 넘는 시트(하늘의 긴 트윈테일)는 같은 너비로 자르지 않고,
 *   이웃한 두 사람 사이에서 그림이 가장 적게 지나가는 세로줄을 찾아 자른다.
 *   그다음 칸 안에서 인물 본체와 이어지지 않은 조각 중 칸 가장자리에 닿은 것(옆 사람 머리카락)은 지운다
 *
 * 사용법: npm run cut-stands [-- <부원> ...]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { alphaBox, keyOut } from './lib/keyout.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets/stand');
const OUT = path.join(ROOT, 'assets/characters');

/** 결과 이미지에서 머리 끝 ~ 턱 높이(px) */
const HEAD_PX = 200;
/** 머리 끝부터 머리 몇 개 높이까지 남길지 (3.1 ≈ 허리 조금 아래) */
const BODY_HEADS = 3.1;
const PAD = 4;

/** 칸 순서(왼쪽부터), 첫 칸 기준 머리 끝·턱의 y(원본 px), 대체 표정 */
const CHARS = {
  // 미래 5번째 칸은 눈 감고 웃는 얼굴이라 smile2로 두고, 화난 얼굴은 4번째(sad)와 비슷한 칸으로 대신한다
  mirae: { order: ['neutral', 'smile', 'surprised', 'sad', 'smile2', 'blush'], head: [4, 142], alias: { angry: 'sad' } },
  dahye: { order: ['neutral', 'angry', 'surprised', 'sad', 'smile', 'blush'], head: [4, 216] },
  yuri: { order: ['neutral', 'smile', 'surprised', 'sad', 'smile2', 'blush'], head: [25, 200], alias: { angry: 'neutral' } },
  seoyun: { order: ['neutral', 'angry', 'surprised', 'sad', 'smile', 'blush'], head: [12, 205] },
  haneul: { order: ['neutral', 'smile', 'surprised', 'angry', 'smile2', 'blush'], head: [15, 173], alias: { sad: 'angry' }, split: 'auto' },
};

/** 이웃한 두 사람 사이에서 그림이 가장 적게 지나가는 세로줄 5개 (y0~y1 줄만 본다) */
function findSplits(data, w, h, y0, y1) {
  const cov = new Float64Array(w);
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) cov[x]++;
  const splits = [0];
  for (let k = 1; k < 6; k++) {
    const guess = (k * w) / 6;
    const span = w / 12;
    let best = Math.round(guess);
    for (let x = Math.round(guess - span); x <= Math.round(guess + span); x++) {
      // 같은 값이면 원래 칸 경계에 가까운 쪽
      if (cov[x] < cov[best] || (cov[x] === cov[best] && Math.abs(x - guess) < Math.abs(best - guess))) best = x;
    }
    splits.push(best);
  }
  splits.push(w);
  return splits;
}

/**
 * x0~x1 칸에서, 가장 큰 덩어리(인물 본체)와 이어지지 않았는데 칸 왼쪽·오른쪽 끝에 닿은 조각은 지운다 (옆 사람 머리카락).
 * 아주 작은 부스러기도 지운다. data를 직접 고친다
 */
function isolateCell(data, w, h, x0, x1, y0, y1) {
  const cw = x1 - x0;
  const ch = y1 - y0;
  const label = new Int32Array(cw * ch).fill(-1);
  const comps = [];
  const stack = [];
  for (let sy = 0; sy < ch; sy++)
    for (let sx = 0; sx < cw; sx++) {
      const si = sy * cw + sx;
      if (label[si] !== -1 || data[((sy + y0) * w + sx + x0) * 4 + 3] <= 8) continue;
      const id = comps.length;
      const comp = { size: 0, edge: false, pixels: [] };
      label[si] = id;
      stack.push(si);
      while (stack.length) {
        const i = stack.pop();
        comp.size++;
        comp.pixels.push(i);
        const x = i % cw;
        const y = (i / cw) | 0;
        if (x === 0 || x === cw - 1) comp.edge = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
            const ni = ny * cw + nx;
            if (label[ni] !== -1 || data[((ny + y0) * w + nx + x0) * 4 + 3] <= 8) continue;
            label[ni] = id;
            stack.push(ni);
          }
      }
      comps.push(comp);
    }
  const main = comps.reduce((a, b) => (b.size > a.size ? b : a), comps[0]);
  let removed = 0;
  for (const c of comps) {
    if (c === main || (!c.edge && c.size >= 60)) continue;
    for (const i of c.pixels) data[(((i / cw) | 0) + y0) * w * 4 + ((i % cw) + x0) * 4 + 3] = 0;
    removed += c.size;
  }
  return removed;
}

async function cutSheet(id, cfg) {
  const file = (await fs.readdir(SRC)).find((f) => f.replace(/\.\w+$/, '') === id);
  if (!file) throw new Error(`assets/stand/${id}.png 가 없습니다`);
  const { data, info } = await sharp(path.join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  keyOut(data, w, h);

  const [headTop, chin] = cfg.head;
  const scale = HEAD_PX / (chin - headTop);
  const bottom = Math.min(h, Math.round(headTop + (chin - headTop) * BODY_HEADS));
  const dir = path.join(OUT, id);
  await fs.mkdir(dir, { recursive: true });
  const sizes = [];
  const rowTop = Math.max(0, headTop - 40);
  const splits = cfg.split === 'auto' ? findSplits(data, w, h, rowTop, bottom) : [0, 1, 2, 3, 4, 5, 6].map((k) => Math.round((k * w) / 6));
  if (cfg.split === 'auto') console.log(`${id} 자르는 줄: ${splits.slice(1, -1).join(', ')} (같은 너비라면 ${[1, 2, 3, 4, 5].map((k) => Math.round((k * w) / 6)).join(', ')})`);

  for (let i = 0; i < 6; i++) {
    const x0 = splits[i];
    const x1 = splits[i + 1];
    // 칸마다 원본을 복사해서 손질 (옆 칸 그림을 지워도 다음 칸에 영향이 없게)
    const work = cfg.split === 'auto' ? Buffer.from(data) : data;
    if (cfg.split === 'auto') {
      const removed = isolateCell(work, w, h, x0, x1, rowTop, bottom);
      if (removed) sizes.push(`(${cfg.order[i]}: 옆 조각 ${removed}px 지움)`);
    }
    const box = alphaBox(work, w, h, x0, x1);
    if (!box) throw new Error(`${id} ${i + 1}번째 칸이 비어 있습니다`);
    // 위: 머리 끝보다 위로 튀어나온 머리카락(더듬이 등)까지, 아래: 허리 아래 기준선
    const top = Math.max(0, Math.min(box.top, headTop) - PAD);
    const left = Math.max(x0, box.left - PAD);
    const right = Math.min(x1 - 1, box.right + PAD);
    const cell = await sharp(work, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left, top, width: right - left + 1, height: bottom - top })
      .resize({ width: Math.round((right - left + 1) * scale), height: Math.round((bottom - top) * scale), kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    await fs.writeFile(path.join(dir, `stand_${cfg.order[i]}.png`), cell.data);
    sizes.push(`${cfg.order[i]} ${cell.info.width}×${cell.info.height}`);
  }
  for (const [expr, from] of Object.entries(cfg.alias ?? {})) {
    await fs.copyFile(path.join(dir, `stand_${from}.png`), path.join(dir, `stand_${expr}.png`));
    sizes.push(`${expr}=${from}`);
  }
  console.log(`${id} (×${scale.toFixed(2)}): ${sizes.join(', ')}`);
}

const only = process.argv.slice(2);
for (const [id, cfg] of Object.entries(CHARS)) {
  if (only.length && !only.includes(id)) continue;
  await cutSheet(id, cfg);
}
