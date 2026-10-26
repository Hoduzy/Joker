import { describe, expect, it } from 'vitest';
import { ACTIONS, CHAPTERS, DEMO_SCENE, EMOTES, ENDINGS, SCREENS, checkLines, type ScriptLine } from '../src/data/narrative';

/** 선택지 안쪽까지 순서대로 펼치기 */
function flat(lines: readonly ScriptLine[]): ScriptLine[] {
  return lines.flatMap((l) => [l, ...(l.choice ?? []).flatMap((c) => flat(c.then ?? []))]);
}

const scripts = [...CHAPTERS.flatMap((c) => c.episodes.map((e) => ({ name: `${e.key} ${e.title}`, lines: e.lines }))), ...ENDINGS.map((e) => ({ name: `ending ${e.id}`, lines: e.lines }))];

describe('연출 태그', () => {
  it('reads the long field names and string/array tags', () => {
    const [l] = checkLines([{ speaker: 'dahye', face: 'angry', text: '…', action: 'shake jump', emote: ['angry'], screen: 'shake_small' }], 'test');
    expect(l).toMatchObject({ s: 'dahye', e: 'angry', t: '…', action: ['shake', 'jump'], emote: ['angry'], screen: ['shake_small'] });
    expect(l).not.toHaveProperty('speaker');
  });

  it('rejects unknown tags and actions without a member', () => {
    expect(() => checkLines([{ s: 'dahye', t: '…', action: 'dance' }], 'test')).toThrow(/dance/);
    expect(() => checkLines([{ t: '나레이션', emote: 'heart' }], 'test')).toThrow(/who/);
    expect(() => checkLines([{ t: '나레이션', who: 'yuri', emote: 'heart' }], 'test')).not.toThrow();
  });

  it('the demo scene shows every tag', () => {
    const used = new Set(flat(DEMO_SCENE.lines).flatMap((l) => [...(l.action ?? []), ...(l.emote ?? []), ...(l.screen ?? [])]));
    for (const tag of [...ACTIONS, ...EMOTES, ...SCREENS]) expect(used, tag).toContain(tag);
  });

  it('the story uses directions, but not on most lines', () => {
    const all = scripts.flatMap((s) => flat(s.lines));
    const tagged = all.filter((l) => l.action || l.emote || l.screen);
    expect(tagged.length).toBeGreaterThan(300);
    expect(tagged.length / all.length).toBeLessThan(0.4);
  });

  it('every closeup goes back (or leaves, or the scene changes) before the episode ends', () => {
    for (const { name, lines } of scripts) {
      const ls = flat(lines);
      ls.forEach((l, i) => {
        if (!l.action?.includes('closeup')) return;
        const who = l.who ?? l.s;
        const rest = ls.slice(i);
        const undone = rest.some((r, j) => (j > 0 && r.bg) || ((r.who ?? r.s) === who && r.action?.some((a) => a === 'back' || a === 'fade_out' || a === 'slide_out')));
        expect(undone, `${name}: ${l.t}`).toBe(true);
      });
    }
  });
});

describe('타이틀 카드 데이터', () => {
  it('every episode and ending has a frequency; chapters each get their own', () => {
    for (const c of CHAPTERS) for (const e of c.episodes) expect(e.frequency, e.key).toMatch(/^(\d{2,3}\.\d|1996)$/);
    for (const e of ENDINGS) expect(e.frequency, e.id).toMatch(/^\d{2,3}\.\d$/);
    const perChapter = CHAPTERS.map((c) => c.episodes.find((e) => e.frequency !== '1996')!.frequency);
    expect(new Set(perChapter).size).toBe(CHAPTERS.length);
  });

  it('the 1996 night is a flashback, and Seoyun episodes never tune in', () => {
    const ep = (k: string) => CHAPTERS.flatMap((c) => c.episodes).find((e) => e.key === k)!;
    expect(ep('9-2').frequency).toBe('1996');
    // 첫 신호, 축제에서 처음 만나는 화, 흐려지는 서윤
    for (const k of ['1-4', '4-3', '8-2']) expect(ep(k).unstable, k).toBe(true);
    expect(ep('1-1').unstable).toBe(false);
  });
});

describe('배경음악', () => {
  const tracks = (lines: readonly ScriptLine[]) => {
    let cur: string | undefined;
    return flat(lines).map((l) => (cur = l.bgm ?? cur));
  };

  it('every episode and ending names its music on the first line', () => {
    for (const { name, lines } of scripts) expect(lines[0].bgm, name).toBeTruthy();
  });

  it('signal scenes are mystery, the 1996 night is flashback, the last broadcast is climax', () => {
    for (const { name, lines } of scripts) {
      const now = tracks(lines);
      flat(lines).forEach((l, i) => {
        if (l.n === '???' || l.n === '신호') expect(now[i], `${name}: ${l.t}`).toMatch(/mystery|climax/);
      });
    }
    const ep = (k: string) => CHAPTERS.flatMap((c) => c.episodes).find((e) => e.key === k)!;
    expect(ep('9-2').lines[0].bgm).toBe('flashback');
    expect(tracks(ep('10-3').lines).every((t) => t === 'climax')).toBe(true);
    for (const e of ENDINGS) expect(tracks(e.lines).at(-1), e.id).toBe('ending');
  });
});
