/**
 * 시즌 이벤트 (할로윈 등). 실제 데이터는 events.json — 다음 시즌엔 항목을 하나 더 추가하면 된다.
 *
 *   id / name / subtitle / theme     이벤트 id, 이름, 부제, 화면 분위기(theme-<theme> 클래스)
 *   start / end                       기간 (ISO 시각, 한국 시간은 +09:00)
 *   currency                          한정 재화 { id, name, icon(assets/ui/<icon>.png), stonesPerUnit: 끝나면 1개당 전파석 }
 *   cards                             이벤트 U 카드 id (cards.json에서 rarity "U", limited = 이벤트 id)
 *   listenerBonusPct                  이벤트 기간에 이 카드를 배치하면 장당 청취자 +%
 *   gacha                             한정 모집 { name, single, ten(재화), rates(U/SSR/SR/R 합 1), pity(이 횟수 안에 U 확정) }
 *   shop                              교환소 [{ id, kind: card/stones/tickets/kits, amount, price, limit, label }]
 *   drops.idle                        방치: everyMin분마다 chance 확률로 min~max개 (꺼 둔 시간은 offlineCapHours까지)
 *   drops.box                         협찬 택배를 열 때 chance 확률로 '할로윈 택배' (min~max개)
 *   drops.rival                       이벤트 전용 격파 상대 (하루 dailyCandyWins번까지 candy개, 첫 승리 보너스)
 *   missions.daily / missions.total   일일·누적 미션 [{ id, label, kind, goal, reward: { candy, stones, tickets, kits } }]
 *   story                             이벤트 스토리 파일 story/event-<story>.json
 */
import raw from './events.json';
import { getCard, type Rarity } from './cards';
import { checkLines, type ScriptLine } from './narrative';

const storyFiles = import.meta.glob('./story/event-*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const iconFiles = import.meta.glob('/assets/ui/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ICONS = new Map<string, string>();
for (const [file, url] of Object.entries(iconFiles)) {
  const m = /\/assets\/ui\/([^/]+)\.png$/.exec(file);
  if (m) ICONS.set(m[1], url);
}
/** assets/ui/<name>.png */
export const uiIconUrl = (name: string) => ICONS.get(name);

export const EVENT_MISSION_KINDS = ['login', 'openBox', 'battleWin', 'onairMinutes', 'ghostWin', 'eventPull', 'uCard', 'story'] as const;
export type EventMissionKind = (typeof EVENT_MISSION_KINDS)[number];

export interface EventRewards {
  candy?: number;
  stones?: number;
  tickets?: number;
  kits?: number;
}

export interface EventMission {
  id: string;
  label: string;
  kind: EventMissionKind;
  goal: number;
  reward: EventRewards;
}

export const SHOP_KINDS = ['card', 'stones', 'tickets', 'kits'] as const;
export interface ShopItem {
  id: string;
  kind: (typeof SHOP_KINDS)[number];
  amount: number;
  price: number;
  limit: number;
  label: string;
}

export interface EventRival {
  id: string;
  name: string;
  emoji: string;
  color: string;
  taunt: string;
  defeat: string;
  candy: number;
  firstWinCandy: number;
  dailyCandyWins: number;
  /** 체력 = 우리 공격력 × 제한 시간 × 이 값 (이길수록 hpGrowthPerWin씩, 최대 hpFactorMax) */
  hpFactor: number;
  hpGrowthPerWin: number;
  hpFactorMax: number;
}

export interface EventEpisode {
  /** 본 기록 키: "ev:<이벤트 id>:<화>" */
  key: string;
  no: number;
  title: string;
  frequency: string;
  unstable: boolean;
  lines: ScriptLine[];
}

export interface EventDef {
  id: string;
  name: string;
  subtitle: string;
  theme: string;
  start: number;
  end: number;
  currency: { id: string; name: string; icon: string; stonesPerUnit: number };
  cards: string[];
  listenerBonusPct: number;
  gacha: { name: string; single: number; ten: number; rates: Record<Rarity, number>; pity: number };
  shop: ShopItem[];
  drops: {
    idle: { everyMin: number; chance: number; min: number; max: number; offlineCapHours: number };
    box: { chance: number; min: number; max: number };
    rival: EventRival;
  };
  missions: { daily: EventMission[]; total: EventMission[] };
  story: EventEpisode[];
}

function load(): EventDef[] {
  if (!Array.isArray(raw)) throw new Error('events.json은 배열이어야 합니다');
  const ids = new Set<string>();
  return (raw as Record<string, any>[]).map((e, i) => {
    const w = `events.json[${i}]${e?.id ? ` (${e.id})` : ''}`;
    const fail = (msg: string): never => {
      throw new Error(`${w}: ${msg}`);
    };
    if (typeof e.id !== 'string' || ids.has(e.id)) fail('id가 없거나 겹칩니다');
    ids.add(e.id);
    const start = Date.parse(e.start);
    const end = Date.parse(e.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail('start/end 기간이 올바르지 않습니다');
    const cards: string[] = Array.isArray(e.cards) ? e.cards : [];
    for (const id of cards) {
      const c = getCard(id);
      if (!c) fail(`알 수 없는 카드 "${id}"`);
      if (c!.rarity !== 'U' || c!.limited !== e.id) fail(`"${id}"는 이 이벤트의 U 카드여야 합니다 (rarity "U", limited "${e.id}")`);
    }
    const rates = e.gacha?.rates ?? {};
    const sum = ['U', 'SSR', 'SR', 'R'].reduce((s, k) => s + (rates[k] ?? 0), 0);
    if (Math.abs(sum - 1) > 1e-6) fail(`gacha.rates의 합이 1이어야 합니다 (${sum})`);
    const missions = (list: unknown, scope: string): EventMission[] =>
      (Array.isArray(list) ? list : []).map((m, j) => {
        if (!(EVENT_MISSION_KINDS as readonly string[]).includes(m.kind)) fail(`missions.${scope}[${j}].kind "${m.kind}"는 없는 종류입니다 (${EVENT_MISSION_KINDS.join('/')})`);
        return { id: m.id, label: m.label, kind: m.kind, goal: Math.max(1, m.goal ?? 1), reward: m.reward ?? {} };
      });
    const shop: ShopItem[] = (Array.isArray(e.shop) ? e.shop : []).map((s: any, j: number) => {
      if (!(SHOP_KINDS as readonly string[]).includes(s.kind)) fail(`shop[${j}].kind "${s.kind}"는 없는 종류입니다`);
      return { id: s.id, kind: s.kind, amount: s.amount ?? 1, price: s.price, limit: s.limit ?? 1, label: s.label ?? s.id };
    });
    const storyRaw = e.story ? (storyFiles[`./story/event-${e.story}.json`] as { episodes?: any[] } | undefined) : undefined;
    if (e.story && !storyRaw) fail(`story/event-${e.story}.json 이 없습니다`);
    const story: EventEpisode[] = (storyRaw?.episodes ?? []).map((ep, j) => ({
      key: `ev:${e.id}:${j + 1}`,
      no: j + 1,
      title: ep.title,
      frequency: typeof ep.frequency === 'number' ? ep.frequency.toFixed(1) : String(ep.frequency ?? '89.7'),
      unstable: ep.signal === 'unstable',
      lines: checkLines(ep.lines, `story/event-${e.story}.json episodes[${j}]`),
    }));
    const r = e.drops?.rival ?? {};
    return {
      id: e.id,
      name: e.name ?? e.id,
      subtitle: e.subtitle ?? '',
      theme: e.theme ?? e.id,
      start,
      end,
      currency: { id: e.currency.id, name: e.currency.name, icon: e.currency.icon, stonesPerUnit: e.currency.stonesPerUnit ?? 0 },
      cards,
      listenerBonusPct: e.listenerBonusPct ?? 0,
      gacha: { name: e.gacha.name, single: e.gacha.single, ten: e.gacha.ten, rates: { U: rates.U ?? 0, SSR: rates.SSR ?? 0, SR: rates.SR ?? 0, R: rates.R ?? 0 }, pity: e.gacha.pity },
      shop,
      drops: {
        idle: { everyMin: 5, chance: 0, min: 0, max: 0, offlineCapHours: 12, ...e.drops?.idle },
        box: { chance: 0, min: 0, max: 0, ...e.drops?.box },
        rival: {
          id: r.id ?? 'event-rival',
          name: r.name ?? '이벤트 상대',
          emoji: r.emoji ?? '👻',
          color: r.color ?? '#9b6bff',
          taunt: r.taunt ?? '',
          defeat: r.defeat ?? '',
          candy: r.candy ?? 0,
          firstWinCandy: r.firstWinCandy ?? 0,
          dailyCandyWins: r.dailyCandyWins ?? 0,
          hpFactor: r.hpFactor ?? 1,
          hpGrowthPerWin: r.hpGrowthPerWin ?? 0,
          hpFactorMax: r.hpFactorMax ?? 1.5,
        },
      },
      missions: { daily: missions(e.missions?.daily, 'daily'), total: missions(e.missions?.total, 'total') },
      story,
    };
  });
}

export const EVENTS: readonly EventDef[] = load();

export const getEvent = (id: string) => EVENTS.find((e) => e.id === id);

/** 이벤트 스토리 화 찾기 ("ev:<id>:<n>") */
export function getEventEpisode(key: string): { event: EventDef; episode: EventEpisode } | undefined {
  for (const event of EVENTS) {
    const episode = event.story.find((s) => s.key === key);
    if (episode) return { event, episode };
  }
  return undefined;
}
