/**
 * 분위기용 텍스트 데이터. 전부 JSON이라 문구를 자유롭게 추가할 수 있다.
 *
 * chat.json
 *   - nicknames: 채팅 닉네임
 *   - general:   언제나 나올 수 있는 채팅
 *   - corners:   오늘의 코너 (하루마다 순서대로 바뀐다). slot은 그날 파워 보너스를 받는 슬롯.
 *                chat은 그 코너일 때만 나오는 채팅
 *   - members:   부원 id → 그 부원이 배치되어 있을 때 나오는 채팅
 *   - events:    레전드 사연·방송사고·마일스톤 등이 일어났을 때 쏟아지는 채팅
 * barks.json     부원 id → 말풍선 대사 (배치된 부원이 10~20초마다 하나씩 말한다)
 * stories.json   레전드 사연 엽서 내용 { from, text }
 * 형식이 틀리면 게임 시작 시 어디가 틀렸는지 에러로 알려 준다.
 */
import barksRaw from './barks.json';
import chatRaw from './chat.json';
import { getMember } from './members';
import { SLOT_IDS, type SlotId } from './slots';
import storiesRaw from './stories.json';

export type ChatEvent = 'legend' | 'legendMissed' | 'accident' | 'accidentFixed' | 'accidentFailed' | 'milestone' | 'towerUp';
const CHAT_EVENTS: ChatEvent[] = ['legend', 'legendMissed', 'accident', 'accidentFixed', 'accidentFailed', 'milestone', 'towerUp'];

export interface CornerDef {
  id: string;
  name: string;
  emoji: string;
  slot: SlotId;
  description: string;
  chat: string[];
}

export interface Story {
  from: string;
  text: string;
}

const strings = (v: unknown, where: string, allowEmpty = false): string[] => {
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string') || (!allowEmpty && v.length === 0)) {
    throw new Error(`${where}: 문자열 배열이어야 합니다${allowEmpty ? '' : ' (1개 이상)'}`);
  }
  return v as string[];
};

function load() {
  const c = chatRaw as Record<string, unknown>;
  const nicknames = strings(c.nicknames, 'chat.json nicknames');
  const general = strings(c.general, 'chat.json general');
  if (!Array.isArray(c.corners) || c.corners.length === 0) throw new Error('chat.json corners: 코너가 하나도 없습니다');
  const corners: CornerDef[] = (c.corners as Record<string, unknown>[]).map((k, i) => {
    const where = `chat.json corners[${i}]`;
    if (typeof k.id !== 'string' || typeof k.name !== 'string') throw new Error(`${where}: id와 name이 필요합니다`);
    if (!SLOT_IDS.includes(k.slot as SlotId)) throw new Error(`${where}: slot은 ${SLOT_IDS.join('/')} 중 하나여야 합니다`);
    return { id: k.id, name: k.name, emoji: typeof k.emoji === 'string' ? k.emoji : '📻', slot: k.slot as SlotId, description: String(k.description ?? ''), chat: strings(k.chat, `${where} chat`, true) };
  });
  const members: Record<string, string[]> = {};
  for (const [id, lines] of Object.entries((c.members ?? {}) as Record<string, unknown>)) {
    if (!getMember(id)) throw new Error(`chat.json members: 알 수 없는 부원 "${id}"`);
    members[id] = strings(lines, `chat.json members.${id}`, true);
  }
  const ev = (c.events ?? {}) as Record<string, unknown>;
  const events = {} as Record<ChatEvent, string[]>;
  for (const key of CHAT_EVENTS) events[key] = ev[key] === undefined ? [] : strings(ev[key], `chat.json events.${key}`, true);

  const barks: Record<string, string[]> = {};
  for (const [id, lines] of Object.entries(barksRaw as Record<string, unknown>)) {
    if (!getMember(id)) throw new Error(`barks.json: 알 수 없는 부원 "${id}"`);
    barks[id] = strings(lines, `barks.json ${id}`, true);
  }

  if (!Array.isArray(storiesRaw) || storiesRaw.length === 0) throw new Error('stories.json: 사연이 하나도 없습니다');
  const stories: Story[] = (storiesRaw as Record<string, unknown>[]).map((s, i) => {
    if (typeof s.text !== 'string') throw new Error(`stories.json[${i}]: text가 필요합니다`);
    return { from: typeof s.from === 'string' ? s.from : '익명', text: s.text };
  });

  return { nicknames, general, corners, members, events, barks, stories };
}

export const FLAVOR = load();
export const CORNERS: readonly CornerDef[] = FLAVOR.corners;

export const pick = <T>(list: readonly T[], rng: () => number = Math.random): T | undefined =>
  list.length ? list[Math.floor(rng() * list.length)] : undefined;

export function getCorner(id: string): CornerDef | undefined {
  return CORNERS.find((c) => c.id === id);
}

/** 로컬 날짜 키 (YYYY-MM-DD) */
export function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** 날짜마다 코너가 순서대로 돌아간다 */
export function cornerForDay(key: string): CornerDef {
  const [y, m, d] = key.split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return CORNERS[((days % CORNERS.length) + CORNERS.length) % CORNERS.length];
}
