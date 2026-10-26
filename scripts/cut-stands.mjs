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
  haneul: { order: ['neutral', 'smile', 'surprised', 'angry', 'smile2', 'blush'], head: [15, 173], alias: { sad: 'angry' } },
};

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

  for (let i = 0; i < 6; i++) {
    const x0 = Math.round((i * w) / 6);
    const x1 = Math.round(((i + 1) * w) / 6);
    const box = alphaBox(data, w, h, x0, x1);
    if (!box) throw new Error(`${id} ${i + 1}번째 칸이 비어 있습니다`);
    // 위: 머리 끝보다 위로 튀어나온 머리카락(더듬이 등)까지, 아래: 허리 아래 기준선
    const top = Math.max(0, Math.min(box.top, headTop) - PAD);
    const left = Math.max(x0, box.left - PAD);
    const right = Math.min(x1 - 1, box.right + PAD);
    const cell = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
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
