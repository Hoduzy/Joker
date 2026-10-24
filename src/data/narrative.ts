/**
 * 스토리·문자·개인 이벤트·호감도 대사 데이터. 전부 JSON이라 직접 고치거나 추가할 수 있다.
 *
 * 대사 한 줄(공통 형식)
 *   { "s": 말하는 사람, "e": 표정, "t": 대사, "bg": 배경 }
 *   - s:  부원 id (dahye/mirae/yuri/haneul/seoyun), "me"(주인공), ""(나레이션)
 *   - e:  neutral / smile / angry / sad / surprised / blush (생략하면 neutral)
 *   - bg: 이 줄부터 바뀌는 배경. classroom / broadcast / rooftop / tower / street /
 *         library / practice / rain / playground / dawn
 *   선택지: { "choice": [ { "t": 보기, "xp": { 부원: 호감도 }, "then": [ 이어지는 대사들 ] } ] }
 *   CG:     { "cg": 부원 id, "caption": 설명 } — assets/cg/<부원>.png 가 있으면 그 이미지, 없으면 빈 칸
 *
 * story.json   chapters[]: { id, title, day, lines } — 챕터 n은 청취자 마일스톤 n-1개 달성 시 열린다
 * events.json  부원 → [{ level, title, lines }] — 호감도 레벨 2/4/6/8/10 단둘이 이벤트
 * texts.json   부원 → [{ minLevel, msgs: [받는 문자], choices: [{ t: 답장, xp, reply: [그 답장에 대한 문자] }] }]
 *              순서대로 하나씩 온다. minLevel 호감도가 되어야 다음 문자가 온다
 * bond.json    부원 → { favorite: 좋아하는 선물 id, lines: [{ e, t }] } — lines[n-1]이 호감도 레벨 n에서 열린다
 */
import bondRaw from './bond.json';
import eventsRaw from './events.json';
import { getMember, MEMBERS } from './members';
import { EXPRESSIONS, type Expression } from './portraits';
import storyRaw from './story.json';
import textsRaw from './texts.json';

export const BACKGROUNDS = ['classroom', 'broadcast', 'rooftop', 'tower', 'street', 'library', 'practice', 'rain', 'playground', 'dawn'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export interface ScriptChoice {
  t: string;
  xp?: Record<string, number>;
  then?: ScriptLine[];
}

export interface ScriptLine {
  s?: string;
  e?: Expression;
  t?: string;
  bg?: Background;
  choice?: ScriptChoice[];
  cg?: string;
  caption?: string;
}

export interface Chapter {
  id: number;
  title: string;
  day: string;
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
    if (l.e !== undefined && !(EXPRESSIONS as readonly string[]).includes(l.e)) fail(w, `표정은 ${EXPRESSIONS.join('/')} 중 하나여야 합니다 ("${l.e}")`);
    if (l.bg !== undefined && !(BACKGROUNDS as readonly string[]).includes(l.bg)) fail(w, `배경은 ${BACKGROUNDS.join('/')} 중 하나여야 합니다 ("${l.bg}")`);
    if (l.cg !== undefined && !getMember(l.cg)) fail(w, `cg에 알 수 없는 부원 "${l.cg}"`);
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
  const chapters: Chapter[] = (storyRaw as { chapters: Chapter[] }).chapters.map((c, i) => ({
    id: c.id ?? i + 1,
    title: c.title,
    day: c.day ?? '',
    lines: checkLines(c.lines, `story.json chapters[${i}]`),
  }));

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
  return { chapters, events, texts, bond };
}

export const NARRATIVE = load();
export const CHAPTERS: readonly Chapter[] = NARRATIVE.chapters;

/** 챕터 번호(1부터)가 열리려면 필요한 마일스톤 수 */
export const chapterUnlock = (id: number) => id - 1;
