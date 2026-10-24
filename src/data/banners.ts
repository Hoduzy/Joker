/**
 * 기간 한정 모집. 실제 데이터는 banners.json.
 *   - id:       모집 id. 한정 카드의 "limited" 값과 같아야 한다
 *   - start/end: 기간 (ISO 시각, 예: 2026-10-24T00:00:00+09:00)
 *   - pickups:  픽업 카드 id. 이 등급이 나오면 50% 확률로 픽업 카드, 천장은 픽업 SSR 확정
 * 기간이 끝난 모집은 뽑기 화면에서 사라지고, 이미 얻은 카드는 그대로 남는다.
 */
import raw from './banners.json';
import { getCard } from './cards';

export interface BannerDef {
  id: string;
  name: string;
  subtitle: string;
  start: number;
  end: number;
  pickups: string[];
}

export const STANDARD_BANNER = 'standard';

function validate(): BannerDef[] {
  if (!Array.isArray(raw)) throw new Error('banners.json은 배열이어야 합니다');
  return raw.map((b, i) => {
    const where = `banners.json[${i}]${b?.id ? ` (${b.id})` : ''}`;
    const start = Date.parse(b.start);
    const end = Date.parse(b.end);
    if (typeof b.id !== 'string' || b.id === STANDARD_BANNER) throw new Error(`${where}: id가 올바르지 않습니다`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`${where}: start/end 기간이 올바르지 않습니다`);
    for (const id of b.pickups ?? []) {
      const card = getCard(id);
      if (!card) throw new Error(`${where}: 알 수 없는 픽업 카드 "${id}"`);
      if (card.limited && card.limited !== b.id) throw new Error(`${where}: "${id}"는 다른 한정 모집(${card.limited}) 카드입니다`);
    }
    return { id: b.id, name: b.name ?? b.id, subtitle: b.subtitle ?? '', start, end, pickups: b.pickups ?? [] };
  });
}

export const BANNERS: readonly BannerDef[] = validate();

export function getBanner(id: string): BannerDef | undefined {
  return BANNERS.find((b) => b.id === id);
}

export function isBannerActive(b: BannerDef, now = Date.now()): boolean {
  return now >= b.start && now <= b.end;
}

export function activeBanners(now = Date.now()): BannerDef[] {
  return BANNERS.filter((b) => isBannerActive(b, now));
}
