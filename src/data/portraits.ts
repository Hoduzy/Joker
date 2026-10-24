/**
 * scripts/cut-sheets.mjs가 만든 캐릭터 이미지(assets/characters/<id>/*.png)를 모은다.
 * 새 캐릭터 폴더를 추가하면 자동으로 잡힌다. URL만 가져오므로 실제 다운로드는 화면에 쓸 때 일어난다.
 */
export const EXPRESSIONS = ['neutral', 'smile', 'angry', 'sad', 'surprised', 'blush'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

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
  const set = portraits.get(id) ?? { faces: {} };
  if (name === 'full' || name === 'sd') set[name] = url;
  else if ((EXPRESSIONS as readonly string[]).includes(name)) set.faces[name as Expression] = url;
  portraits.set(id, set);
}

export function getPortraits(id: string): PortraitSet | undefined {
  return portraits.get(id);
}

/** 표정 이미지. 해당 표정이 없으면 기본 표정으로 대체한다. */
export function faceUrl(id: string, expr: Expression = 'neutral'): string | undefined {
  const set = portraits.get(id);
  return set?.faces[expr] ?? set?.faces.neutral;
}

export function sdUrl(id: string): string | undefined {
  return portraits.get(id)?.sd;
}

export function portraitIds(): string[] {
  return [...portraits.keys()].sort();
}
