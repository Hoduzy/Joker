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
