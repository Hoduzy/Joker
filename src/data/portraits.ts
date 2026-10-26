/**
 * scripts/cut-sheets.mjs가 만든 캐릭터 이미지(assets/characters/<id>/*.png)를 모은다.
 * 새 캐릭터 폴더를 추가하면 자동으로 잡힌다. URL만 가져오므로 실제 다운로드는 화면에 쓸 때 일어난다.
 */
export const EXPRESSIONS = ['neutral', 'smile', 'angry', 'sad', 'surprised', 'blush'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** 스탠딩에만 있는 표정 (눈 감고 크게 웃는 얼굴). 얼굴 타일에서는 smile로 보인다 */
export const STAND_EXPRESSIONS = [...EXPRESSIONS, 'smile2'] as const;
export type StandExpression = (typeof STAND_EXPRESSIONS)[number];

/** 스탠딩 이미지의 기준 높이(px): scripts/cut-stands.mjs가 머리 크기를 맞춘 '머리 끝~허리 아래' 높이 */
export const STAND_REF_HEIGHT = 640;

export const EXPRESSION_LABELS: Record<Expression, string> = {
  neutral: '기본',
  smile: '웃음',
  angry: '화남',
  sad: '슬픔',
  surprised: '놀람',
  blush: '부끄러움',
};

export interface PortraitSet {
  full?: string;
  sd?: string;
  faces: Partial<Record<Expression, string>>;
  /** 스토리용 스탠딩: stand_<표정>.png */
  stands: Partial<Record<StandExpression, string>>;
}

const files = import.meta.glob('/assets/characters/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const portraits = new Map<string, PortraitSet>();
for (const [file, url] of Object.entries(files)) {
  const match = /\/assets\/characters\/([^/]+)\/([^/]+)\.png$/.exec(file);
  if (!match) continue;
  const [, id, name] = match;
  const set = portraits.get(id) ?? { faces: {}, stands: {} };
  const stand = /^stand_(\w+)$/.exec(name)?.[1];
  if (name === 'full' || name === 'sd') set[name] = url;
  else if ((EXPRESSIONS as readonly string[]).includes(name)) set.faces[name as Expression] = url;
  else if (stand && (STAND_EXPRESSIONS as readonly string[]).includes(stand)) set.stands[stand as StandExpression] = url;
  portraits.set(id, set);
}

export function getPortraits(id: string): PortraitSet | undefined {
  return portraits.get(id);
}

/** 표정 이미지. 해당 표정이 없으면 기본 표정, 의상 폴더에 없으면 fallback(부원) 폴더에서 찾는다. */
export function faceUrl(id: string, expr: StandExpression = 'neutral', fallback?: string): string | undefined {
  const set = portraits.get(id);
  const e: Expression = expr === 'smile2' ? 'smile' : expr;
  const url = set?.faces[e] ?? set?.faces.neutral;
  return url ?? (fallback && fallback !== id ? faceUrl(fallback, expr) : undefined);
}

/**
 * 스토리 스탠딩 이미지. 그 표정이 없으면 기본(neutral), 스탠딩이 아예 없으면 전신(full.png)으로 대신한다.
 * cropped: 스탠딩(머리 끝~허리 아래로 맞춘 그림)이면 true, 전신 대체면 false
 */
export function standUrl(id: string, expr: StandExpression = 'neutral'): { url?: string; cropped: boolean; fallback: boolean } {
  const set = portraits.get(id);
  const stands = set?.stands ?? {};
  const url = stands[expr] ?? stands.neutral;
  if (url) return { url, cropped: true, fallback: !stands[expr] };
  return { url: set?.full, cropped: false, fallback: true };
}

export function sdUrl(id: string, fallback?: string): string | undefined {
  return portraits.get(id)?.sd ?? (fallback ? portraits.get(fallback)?.sd : undefined);
}

export function portraitIds(): string[] {
  return [...portraits.keys()].sort();
}

/** 카드 전용 일러스트: assets/cards/<카드 id>.png (없으면 부원 전신 이미지를 대신 쓴다) */
const cardFiles = import.meta.glob('/assets/cards/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const cardArt = new Map<string, string>();
for (const [file, url] of Object.entries(cardFiles)) {
  const match = /\/assets\/cards\/([^/]+)\.\w+$/.exec(file);
  if (match) cardArt.set(match[1], url);
}

/**
 * 카드 일러스트 URL과, 전용 일러스트인지(아니면 전신 이미지 대체) 여부.
 * key는 의상 폴더(없으면 부원) — 의상이 있는 카드는 그 의상의 전신 이미지를 쓴다.
 */
export function cardArtUrl(cardId: string, key: string, memberId = key): { url?: string; dedicated: boolean } {
  const dedicated = cardArt.get(cardId);
  if (dedicated) return { url: dedicated, dedicated: true };
  return { url: portraits.get(key)?.full ?? portraits.get(memberId)?.full, dedicated: false };
}
