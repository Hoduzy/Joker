/**
 * 스토리·문자·개인 이벤트·호감도 대사 데이터. 전부 JSON이라 직접 고치거나 추가할 수 있다.
 *
 * 대사 한 줄(공통 형식)
 *   { "s": 말하는 사람, "e": 표정, "t": 대사, "bg": 배경 }
 *   - s:  부원 id (dahye/mirae/yuri/haneul/seoyun), "me"(주인공), 생략하거나 ""면 나레이션
 *   - n:  부원이 아닌 사람의 이름표 (예: "백시아", "이모") — 스탠딩 없이 이름만 나온다
 *   - t 안의 {이름} 은 플레이어가 정한 주인공 이름으로 바뀐다
 *   - e:  neutral / smile / angry / sad / surprised / blush (생략하면 neutral)
 *   - bg: 이 줄부터 바뀌는 배경(장면 전환). classroom / broadcast / hallway / rooftop / street
 *         이미지는 assets/bg/<배경>.png|jpg|webp — 없으면 그라데이션으로 대신 그린다
 *   선택지: { "choice": [ { "t": 보기, "xp": { 부원: 호감도 }, "then": [ 이어지는 대사들 ] } ] }
 *   CG:     { "cg": CG id, "caption": 설명 } — assets/cg/<id>.png 가 있으면 그 이미지, 없으면 빈 칸
 *           (개인 이벤트는 부원 id, 메인 스토리는 story-로 시작하는 id)
 *
 * story/chapterNN.json  { id, title, unlock: 누적 청취자, summary, episodes: [{ title, lines }] }
 *              챕터는 누적 청취자가 unlock을 넘으면 열리고, 화(episode)는 앞의 화를 다 봐야 이어서 볼 수 있다
 * story/endings.json    부원 → { title, lines } + "true" → { title, minLevel, lines }
 *              마지막 화를 본 뒤, 다섯 명 모두 호감도 minLevel 이상이면 진엔딩, 아니면 호감도가 가장 높은 부원의 엔딩
 * events.json  부원 → [{ level, title, lines }] — 호감도 레벨 2/4/6/8/10 단둘이 이벤트
 * texts.json   부원 → [{ minLevel, msgs: [받는 문자], choices: [{ t: 답장, xp, reply: [그 답장에 대한 문자] }] }]
 *              순서대로 하나씩 온다. minLevel 호감도가 되어야 다음 문자가 온다
 * bond.json    부원 → { favorite: 좋아하는 선물 id, lines: [{ e, t }] } — lines[n-1]이 호감도 레벨 n에서 열린다
 */
import bondRaw from './bond.json';
import eventsRaw from './events.json';
import { getMember, MEMBERS } from './members';
import { EXPRESSIONS, type Expression } from './portraits';
import endingsRaw from './story/endings.json';
import textsRaw from './texts.json';

const chapterFiles = import.meta.glob('./story/chapter*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const BACKGROUNDS = ['classroom', 'broadcast', 'hallway', 'rooftop', 'street'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export interface ScriptChoice {
  t: string;
  xp?: Record<string, number>;
  then?: ScriptLine[];
}

export interface ScriptLine {
  s?: string;
  /** 부원이 아닌 말하는 사람의 이름 */
  n?: string;
  e?: Expression;
  t?: string;
  bg?: Background;
  choice?: ScriptChoice[];
  cg?: string;
  caption?: string;
}

export interface Episode {
  /** "챕터-화" (예: "1-3") — 본 기록 키 */
  key: string;
  chapter: number;
  /** 챕터 안에서 몇 번째 화인지 (1부터) */
  no: number;
  title: string;
  lines: ScriptLine[];
}

export interface Chapter {
  id: number;
  title: string;
  /** 이 누적 청취자를 넘으면 열린다 */
  unlock: number;
  summary: string;
  episodes: Episode[];
}

export interface Ending {
  /** 부원 id, 또는 "true"(진엔딩) */
  id: string;
  title: string;
  /** 진엔딩: 다섯 명 모두 이 호감도 레벨 이상 */
  minLevel?: number;
  lines: ScriptLine[];
}

export interface PersonalEvent {
  level: number;
  title: string;
  lines: ScriptLine[];
}

export interface TextConvo {
  minLevel: number;
  msgs: string[];
  choices: { t: string; xp: number; reply: string[] }[];
}

export interface BondInfo {
  favorite: string;
  lines: { e: Expression; t: string }[];
}

function fail(where: string, msg: string): never {
  throw new Error(`${where}: ${msg}`);
}

function checkXp(xp: unknown, where: string) {
  if (xp === undefined) return;
  if (typeof xp !== 'object' || xp === null) fail(where, 'xp는 { 부원: 숫자 } 형식이어야 합니다');
  for (const [id, n] of Object.entries(xp)) {
    if (!getMember(id)) fail(where, `xp에 알 수 없는 부원 "${id}"`);
    if (typeof n !== 'number') fail(where, `xp.${id}가 숫자가 아닙니다`);
  }
}

function checkLines(lines: unknown, where: string): ScriptLine[] {
  if (!Array.isArray(lines) || lines.length === 0) fail(where, 'lines가 비어 있습니다');
  lines.forEach((l: ScriptLine, i: number) => {
    const w = `${where} lines[${i}]`;
    if (l.s !== undefined && l.s !== '' && l.s !== 'me' && !getMember(l.s)) fail(w, `알 수 없는 말하는 사람 "${l.s}"`);
    if (l.n !== undefined && (typeof l.n !== 'string' || l.s)) fail(w, 'n(이름표)은 s 없이 문자열로 씁니다');
    if (l.e !== undefined && !(EXPRESSIONS as readonly string[]).includes(l.e)) fail(w, `표정은 ${EXPRESSIONS.join('/')} 중 하나여야 합니다 ("${l.e}")`);
    if (l.bg !== undefined && !(BACKGROUNDS as readonly string[]).includes(l.bg)) fail(w, `배경은 ${BACKGROUNDS.join('/')} 중 하나여야 합니다 ("${l.bg}")`);
    if (l.cg !== undefined && !getMember(l.cg) && !/^story-[\w-]+$/.test(l.cg)) fail(w, `cg는 부원 id 또는 story-로 시작하는 id여야 합니다 ("${l.cg}")`);
    if (l.choice) {
      if (!Array.isArray(l.choice) || l.choice.length < 2) fail(w, '선택지는 2개 이상이어야 합니다');
      l.choice.forEach((c, j) => {
        if (typeof c.t !== 'string') fail(`${w} choice[${j}]`, '보기 문구(t)가 없습니다');
        checkXp(c.xp, `${w} choice[${j}]`);
        if (c.then) checkLines(c.then, `${w} choice[${j}].then`);
      });
    } else if (l.cg === undefined && typeof l.t !== 'string') fail(w, '대사(t)가 없습니다');
  });
  return lines as ScriptLine[];
}

function load() {
  type RawChapter = { id: number; title: string; unlock: number; summary?: string; episodes: { title: string; lines: unknown }[] };
  const chapters: Chapter[] = Object.entries(chapterFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const c = raw as RawChapter;
      const w = file.replace('./', '');
      if (typeof c.id !== 'number' || typeof c.title !== 'string') fail(w, 'id·title이 필요합니다');
      if (typeof c.unlock !== 'number') fail(w, 'unlock(누적 청취자)이 필요합니다');
      if (!Array.isArray(c.episodes) || c.episodes.length === 0) fail(w, 'episodes가 비어 있습니다');
      return {
        id: c.id,
        title: c.title,
        unlock: c.unlock,
        summary: c.summary ?? '',
        episodes: c.episodes.map((e, i) => ({
          key: `${c.id}-${i + 1}`,
          chapter: c.id,
          no: i + 1,
          title: e.title,
          lines: checkLines(e.lines, `${w} episodes[${i}]`),
        })),
      };
    });
  chapters.forEach((c, i) => {
    if (c.id !== i + 1) fail(`story/chapter${String(i + 1).padStart(2, '0')}.json`, `챕터 번호가 ${i + 1}이어야 합니다 (${c.id})`);
    if (i > 0 && c.unlock < chapters[i - 1].unlock) fail(`챕터 ${c.id}`, 'unlock은 앞 챕터보다 작을 수 없습니다');
  });

  const endings: Ending[] = Object.entries(endingsRaw as Record<string, { title: string; minLevel?: number; lines: unknown }>).map(([id, e]) => {
    if (id !== 'true' && !getMember(id)) fail('story/endings.json', `알 수 없는 엔딩 "${id}"`);
    return { id, title: e.title, minLevel: e.minLevel, lines: checkLines(e.lines, `story/endings.json ${id}`) };
  });

  const events: Record<string, PersonalEvent[]> = {};
  const texts: Record<string, TextConvo[]> = {};
  const bond: Record<string, BondInfo> = {};
  for (const m of MEMBERS) {
    events[m.id] = ((eventsRaw as Record<string, PersonalEvent[]>)[m.id] ?? []).map((e, i) => ({
      level: e.level,
      title: e.title,
      lines: checkLines(e.lines, `events.json ${m.id}[${i}]`),
    }));
    texts[m.id] = ((textsRaw as Record<string, TextConvo[]>)[m.id] ?? []).map((t, i) => {
      const w = `texts.json ${m.id}[${i}]`;
      if (!Array.isArray(t.msgs) || t.msgs.length === 0) fail(w, 'msgs가 비어 있습니다');
      if (!Array.isArray(t.choices) || t.choices.length < 2 || t.choices.length > 3) fail(w, '답장 보기는 2~3개여야 합니다');
      return { minLevel: t.minLevel ?? 1, msgs: t.msgs, choices: t.choices.map((c) => ({ t: c.t, xp: c.xp ?? 0, reply: c.reply ?? [] })) };
    });
    const b = (bondRaw as Record<string, BondInfo>)[m.id];
    if (!b) fail('bond.json', `"${m.id}" 항목이 없습니다`);
    bond[m.id] = { favorite: b.favorite, lines: b.lines.map((l) => ({ e: (l.e ?? 'neutral') as Expression, t: l.t })) };
  }
  return { chapters, endings, events, texts, bond };
}

export const NARRATIVE = load();
export const CHAPTERS: readonly Chapter[] = NARRATIVE.chapters;
/** 모든 화를 읽는 순서대로 */
export const EPISODES: readonly Episode[] = CHAPTERS.flatMap((c) => c.episodes);
export const ENDINGS: readonly Ending[] = NARRATIVE.endings;

export const getEpisode = (key: string) => EPISODES.find((e) => e.key === key);
export const getEnding = (id: string) => ENDINGS.find((e) => e.id === id);
