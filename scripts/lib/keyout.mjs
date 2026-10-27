/**
 * 흰 배경·반투명 잔여물(체크무늬를 지운 뒤 남는 뿌연 층)을 투명하게 만든다. RGBA raw 버퍼를 직접 고친다.
 *
 * 1. 반투명(알파 < alphaSolid) 픽셀은 어디 있든 지운다
 * 2. 테두리와 이어진 '거의 흰색' 픽셀을 지운다 → 테두리와 안 이어진 흰 셔츠·하이라이트는 남는다
 * 3. 남은 조각 중 전체 대비 speckRatio보다 작은 부스러기를 지운다
 * 4. (defringe) 배경과 맞닿은 밝은 픽셀을 몇 겹 깎는다 — whiteMin을 높게 잡아 남은 흰 헤일로 제거
 * 5. 바깥 1px은 반투명으로 (흰 테두리 줄이기)
 */
export function keyOut(data, w, h, { whiteMin = 238, whiteSpread = 16, alphaSolid = 140, speckRatio = 0.002, edgeAlpha = 170, defringe = 0, fringeMin = 215 } = {}) {
  const n = w * h;
  const isBg = (i) => {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    return data[o + 3] < alphaSolid || (mn >= whiteMin && mx - mn <= whiteSpread);
  };

  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < alphaSolid) bg[i] = 1;
  const stack = [];
  const push = (i) => {
    if (!bg[i] && isBg(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  // 반투명으로 지운 자리와 맞닿은 흰 배경도 이어서 지운다
  for (let i = 0; i < n; i++) if (bg[i] && data[i * 4 + 3] < alphaSolid) stack.push(i);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }

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
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < n && !bg[j] && !label[j]) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
    total += size;
  }
  for (let i = 0; i < n; i++) if (!bg[i] && sizes[label[i]] < total * speckRatio) bg[i] = 1;

  // 흰 테두리(헤일로) 벗기기: 배경과 맞닿은 밝은 픽셀을 defringe 겹만큼 깎는다 (그림의 어두운 외곽선에서 멈춘다)
  for (let pass = 0; pass < defringe; pass++) {
    const peel = [];
    for (let i = 0; i < n; i++) {
      if (bg[i]) continue;
      const x = i % w;
      const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < n - w && bg[i + w]);
      if (!edge) continue;
      const o = i * 4;
      const mn = Math.min(data[o], data[o + 1], data[o + 2]), mx = Math.max(data[o], data[o + 1], data[o + 2]);
      if (mn >= fringeMin && mx - mn <= 28) peel.push(i);
    }
    for (const i of peel) bg[i] = 1;
  }

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (bg[i]) {
      data[o + 3] = 0;
      continue;
    }
    const x = i % w;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < n - w && bg[i + w]);
    if (edge) data[o + 3] = Math.min(data[o + 3], edgeAlpha);
  }
  return data;
}

/** 알파가 있는 픽셀의 경계 상자 (없으면 null) */
export function alphaBox(data, w, h, x0 = 0, x1 = w, threshold = 8) {
  let left = x1, right = -1, top = h, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, right, top, bottom };
}
