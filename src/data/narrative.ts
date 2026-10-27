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
 *   - bgm: 이 줄부터 바뀌는 배경음악 (assets/bgm/<곡>.mp3). 같은 곡이 이어지면 끊기지 않는다, "none"이면 조용히
 *         main title daily comic calm mystery sad battle romance flashback climax ending
 *         화의 첫 줄에는 꼭 쓴다 (안 쓰면 직전 곡이 이어진다)
 *   - speaker / face / text / name 은 s / e / t / n 과 같은 뜻으로 써도 된다
 *
 *   연출 태그 (전부 선택, 문자열 하나·공백으로 여러 개·배열 모두 가능)
 *   - action: 말하는 부원(또는 who)의 동작
 *       jump(통통) shake(떨기) nod(끄덕) down(가라앉아 유지) closeup(1.3배 앞으로, 유지) back(원래대로)
 *       slide_in_left / slide_in_right / fade_in (등장 방식)
 *       fade_out / slide_out (이 대사를 넘기면 퇴장)
 *   - emote: 머리 위 감정 아이콘 — sweat exclaim question heart angry music dots shy sparkle
 *   - screen: 화면 효과
 *       shake_small / shake_big / flash_white (한 번)
 *       vignette / blur_bg / sepia (켜 두면 clear 할 때까지 유지)
 *       fade_black (까맣게 암전한 뒤 이 줄을 보여 준다) · clear (유지 효과 끄기)
 *   - who: 동작·아이콘을 받을 부원 (나레이션 줄에서 부원을 움직일 때)
 *   예) { "speaker": "dahye", "face": "angry", "text": "…", "action": "shake", "emote": "angry", "screen": "shake_small" }
 *
 *   선택지: { "choice": [ { "t": 보기, "xp": { 부원: 호감도 }, "then": [ 이어지는 대사들 ] } ] }
 *   CG:     { "cg": CG id, "caption": 설명 } — assets/cg/<id>.png 가 있으면 그 이미지, 없으면 빈 칸
 *           (개인 이벤트는 부원 id, 메인 스토리는 story-로 시작하는 id)
 *
 * story/chapterNN.json  { id, title, unlock: 누적 청취자, summary, episodes: [{ chapter, episode, title, frequency, signal?, lines }] }
 *              챕터는 누적 청취자가 unlock을 넘으면 열리고, 화(episode)는 앞의 화를 다 봐야 이어서 볼 수 있다
 *              화를 시작할 때 타이틀 카드: 라디오 다이얼이 frequency(MHz)에 맞춰지며 제목이 나온다
 *                - frequency: 87.5~108 사이 숫자. "1996"이면 회상 화 (세피아 + 숫자 대신 1996)
 *                - signal: "unstable"이면 주파수가 끝까지 안 맞고 흔들린다 (서윤 등장·서윤 중심 화)
 *                - chapter·episode는 파일·순서와 같아야 한다 (틀리면 오류)
 * story/endings.json    부원 → { title, frequency, lines } + "true" → { title, frequency, minLevel, lines }
 *              마지막 화를 본 뒤, 다섯 명 모두 호감도 minLevel 이상이면 진엔딩, 아니면 호감도가 가장 높은 부원의 엔딩
 * bondEvents.json  부원 → [{ level, title, lines }] — 호감도 레벨 2/4/6/8/10 단둘이 이벤트 (시즌 이벤트는 events.json)
 * texts.json   부원 → [{ minLevel, msgs: [받는 문자], choices: [{ t: 답장, xp, reply: [그 답장에 대한 문자] }] }]
 *              순서대로 하나씩 온다. minLevel 호감도가 되어야 다음 문자가 온다
 * bond.json    부원 → { favorite: 좋아하는 선물 id, lines: [{ e, t }] } — lines[n-1]이 호감도 레벨 n에서 열린다
 */
import bondRaw from './bond.json';
import eventsRaw from './bondEvents.json';
import { getMember, MEMBERS } from './members';
import { STAND_EXPRESSIONS, type Expression, type StandExpression } from './portraits';
import demoRaw from './story/demo.json';
import endingsRaw from './story/endings.json';
import textsRaw from './texts.json';

const chapterFiles = import.meta.glob('./story/chapter*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const BACKGROUNDS = ['classroom', 'broadcast', 'hallway', 'rooftop', 'street'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export const BGMS = ['main', 'title', 'daily', 'comic', 'calm', 'mystery', 'sad', 'battle', 'romance', 'flashback', 'climax', 'ending', 'none'] as const;
export type Bgm = (typeof BGMS)[number];
export const ACTIONS = ['jump', 'shake', 'nod', 'down', 'closeup', 'back', 'slide_in_left', 'slide_in_right', 'fade_in', 'fade_out', 'slide_out'] as const;
export type Action = (typeof ACTIONS)[number];
export const EMOTES = ['sweat', 'exclaim', 'question', 'heart', 'angry', 'music', 'dots', 'shy', 'sparkle'] as const;
export type Emote = (typeof EMOTES)[number];
export const SCREENS = ['shake_small', 'shake_big', 'flash_white', 'vignette', 'blur_bg', 'sepia', 'fade_black', 'clear'] as const;
export type Screen = (typeof SCREENS)[number];

export interface ScriptChoice {
  t: string;
  xp?: Record<string, number>;
  then?: ScriptLine[];
}

export interface ScriptLine {
  s?: string;
  /** 부원이 아닌 말하는 사람의 이름 */
  n?: string;
  /** 표정. 스탠딩에 그 표정이 없으면 neutral로 나온다 */
  e?: StandExpression;
  t?: string;
  bg?: Background;
  /** 이 줄부터 바뀌는 배경음악 ("none"이면 조용히) */
  bgm?: Bgm;
  choice?: ScriptChoice[];
  cg?: string;
  caption?: string;
  /** 연출: 읽을 때 문자열·배열 어느 쪽이든 배열로 바꿔 둔다 */
  action?: Action[];
  emote?: Emote[];
  screen?: Screen[];
  /** 동작·아이콘을 받을 부원 (생략하면 말하는 부원) */
  who?: string;
}

export interface Episode {
  /** "챕터-화" (예: "1-3") — 본 기록 키 */
  key: string;
  chapter: number;
  /** 챕터 안에서 몇 번째 화인지 (1부터) */
  no: number;
  title: string;
  /** 타이틀 카드 주파수: "89.7" 같은 MHz, 회상 화는 "1996" */
  frequency: string;
  /** 주파수가 끝까지 안 맞는 화 (서윤) */
  unstable: boolean;
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
  frequency: string;
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

const ALIASES: [string, keyof ScriptLine][] = [
  ['speaker', 's'],
  ['face', 'e'],
  ['text', 't'],
  ['name', 'n'],
];

/** "jump shake" · "jump,shake" · ["jump"] → ["jump", "shake"], 목록에 없는 태그는 오류 */
function tagList<T extends string>(v: unknown, allowed: readonly T[], what: string, w: string): T[] | undefined {
  if (v === undefined || v === '') return undefined;
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/).filter(Boolean) : fail(w, `${what}는 문자열이나 배열이어야 합니다`);
  for (const t of list) if (!(allowed as readonly unknown[]).includes(t)) fail(w, `${what} "${t}"는 없는 태그입니다 (${allowed.join('/')})`);
  return list as T[];
}

/** 대사 목록 검사 + 정리 (별칭 바꾸기, 연출 태그를 배열로). 잘못되면 어디가 틀렸는지 알려 주는 오류 */
export function checkLines(lines: unknown, where: string): ScriptLine[] {
  if (!Array.isArray(lines) || lines.length === 0) fail(where, 'lines가 비어 있습니다');
  lines.forEach((l: ScriptLine, i: number) => {
    const w = `${where} lines[${i}]`;
    const raw = l as unknown as Record<string, unknown>;
    for (const [long, short] of ALIASES) {
      if (raw[long] === undefined) continue;
      if (raw[short] !== undefined) fail(w, `${long}와 ${short}를 같이 쓸 수 없습니다`);
      raw[short] = raw[long];
      delete raw[long];
    }
    l.action = tagList(raw.action, ACTIONS, 'action', w);
    l.emote = tagList(raw.emote, EMOTES, 'emote', w);
    l.screen = tagList(raw.screen, SCREENS, 'screen', w);
    if (!l.action) delete l.action;
    if (!l.emote) delete l.emote;
    if (!l.screen) delete l.screen;
    if (l.bgm !== undefined && !(BGMS as readonly string[]).includes(l.bgm)) fail(w, `bgm은 ${BGMS.join('/')} 중 하나여야 합니다 ("${l.bgm}")`);
    if (l.who !== undefined && !getMember(l.who)) fail(w, `who "${l.who}"는 부원 id여야 합니다`);
    if ((l.action || l.emote) && !l.who && !(l.s && getMember(l.s))) fail(w, 'action·emote는 부원이 말하는 줄이나 who가 있는 줄에만 씁니다');
    if (l.s !== undefined && l.s !== '' && l.s !== 'me' && !getMember(l.s)) fail(w, `알 수 없는 말하는 사람 "${l.s}"`);
    if (l.n !== undefined && (typeof l.n !== 'string' || l.s)) fail(w, 'n(이름표)은 s 없이 문자열로 씁니다');
    if (l.e !== undefined && !(STAND_EXPRESSIONS as readonly string[]).includes(l.e)) fail(w, `표정은 ${STAND_EXPRESSIONS.join('/')} 중 하나여야 합니다 ("${l.e}")`);
    if (l.bg !== undefined && !(BACKGROUNDS as readonly string[]).includes(l.bg)) fail(w, `배경은 ${BACKGROUNDS.join('/')} 중 하나여야 합니다 ("${l.bg}")`);
    if (l.cg !== undefined && !getMember(l.cg) && !/^(story|card)-[\w-]+$/.test(l.cg)) fail(w, `cg는 부원 id 또는 story-·card-로 시작하는 id여야 합니다 ("${l.cg}")`);
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

/** 89.7 → "89.7", "1996" → "1996". FM 대역(87.5~108)이나 회상(1996)만 */
function readFrequency(v: unknown, where: string): string {
  if (v === '1996') return v;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!(n >= 87.5 && n <= 108)) fail(where, `frequency는 87.5~108 사이 숫자나 "1996"이어야 합니다 (${String(v)})`);
  return n.toFixed(1);
}

function load() {
  type RawEpisode = { chapter?: number; episode?: number; title: string; frequency?: unknown; signal?: string; lines: unknown };
  type RawChapter = { id: number; title: string; unlock: number; summary?: string; episodes: RawEpisode[] };
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
        episodes: c.episodes.map((e, i) => {
          const we = `${w} episodes[${i}]`;
          if (e.chapter !== undefined && e.chapter !== c.id) fail(we, `chapter가 ${c.id}이어야 합니다 (${e.chapter})`);
          if (e.episode !== undefined && e.episode !== i + 1) fail(we, `episode가 ${i + 1}이어야 합니다 (${e.episode})`);
          if (e.signal !== undefined && e.signal !== 'unstable') fail(we, `signal은 "unstable"만 쓸 수 있습니다 ("${e.signal}")`);
          return {
            key: `${c.id}-${i + 1}`,
            chapter: c.id,
            no: i + 1,
            title: e.title,
            frequency: readFrequency(e.frequency ?? 89.7, we),
            unstable: e.signal === 'unstable',
            lines: checkLines(e.lines, we),
          };
        }),
      };
    });
  chapters.forEach((c, i) => {
    if (c.id !== i + 1) fail(`story/chapter${String(i + 1).padStart(2, '0')}.json`, `챕터 번호가 ${i + 1}이어야 합니다 (${c.id})`);
    if (i > 0 && c.unlock < chapters[i - 1].unlock) fail(`챕터 ${c.id}`, 'unlock은 앞 챕터보다 작을 수 없습니다');
  });

  const endings: Ending[] = Object.entries(endingsRaw as Record<string, { title: string; frequency?: unknown; minLevel?: number; lines: unknown }>).map(([id, e]) => {
    if (id !== 'true' && !getMember(id)) fail('story/endings.json', `알 수 없는 엔딩 "${id}"`);
    return { id, title: e.title, frequency: readFrequency(e.frequency ?? 89.7, `story/endings.json ${id}`), minLevel: e.minLevel, lines: checkLines(e.lines, `story/endings.json ${id}`) };
  });

  const events: Record<string, PersonalEvent[]> = {};
  const texts: Record<string, TextConvo[]> = {};
  const bond: Record<string, BondInfo> = {};
  for (const m of MEMBERS) {
    events[m.id] = ((eventsRaw as Record<string, PersonalEvent[]>)[m.id] ?? []).map((e, i) => ({
      level: e.level,
      title: e.title,
      lines: checkLines(e.lines, `bondEvents.json ${m.id}[${i}]`),
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
  const demo = { title: demoRaw.title, lines: checkLines(demoRaw.lines, 'story/demo.json') };
  return { chapters, endings, events, texts, bond, demo };
}

export const NARRATIVE = load();
export const CHAPTERS: readonly Chapter[] = NARRATIVE.chapters;
/** 모든 화를 읽는 순서대로 */
export const EPISODES: readonly Episode[] = CHAPTERS.flatMap((c) => c.episodes);
export const ENDINGS: readonly Ending[] = NARRATIVE.endings;

export const getEpisode = (key: string) => EPISODES.find((e) => e.key === key);
export const getEnding = (id: string) => ENDINGS.find((e) => e.id === id);
/** 연출 테스트 장면 (story/demo.json) — 설정에서 볼 수 있다 */
export const DEMO_SCENE = NARRATIVE.demo;
