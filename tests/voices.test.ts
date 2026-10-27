import { describe, expect, it } from 'vitest';
import { MEMBERS } from '../src/data/members';
import { voiceFor } from '../src/data/voices';

describe('말소리 (voices.json)', () => {
  it('gives every member a voice, and none to narration or the player', () => {
    for (const m of MEMBERS) expect(voiceFor({ s: m.id }), m.id).not.toBeNull();
    expect(voiceFor({})).toBeNull();
    expect(voiceFor({ s: 'me' })).toBeNull();
    expect(voiceFor({ n: '백시아' })).toBeNull();
    // 송신탑 신호는 서윤 목소리
    expect(voiceFor({ n: '???' })).toEqual(voiceFor({ s: 'seoyun' }));
  });

  it('matches the requested character of each voice', () => {
    const v = (id: string) => voiceFor({ s: id })!;
    expect(v('dahye').wave).toBe('square');
    expect(v('dahye').pitch).toBeLessThan(v('mirae').pitch);
    expect(v('haneul').pitch).toBe(Math.max(...MEMBERS.map((m) => v(m.id).pitch)));
    expect(v('mirae').crush).toBeGreaterThan(0);
    expect(v('mirae').jitter).toBeLessThan(v('yuri').jitter);
    expect(v('yuri').wave).toBe('triangle');
    expect(v('haneul').sparkle).toBeGreaterThan(0);
    expect(v('seoyun').reverb).toBeGreaterThan(0);
    expect(v('seoyun').charMs).toBeGreaterThan(v('yuri').charMs);
  });

  it('bends the voice with the expression', () => {
    const base = voiceFor({ s: 'yuri' }, 'neutral')!;
    const angry = voiceFor({ s: 'yuri' }, 'angry')!;
    const surprised = voiceFor({ s: 'yuri' }, 'surprised')!;
    const sad = voiceFor({ s: 'yuri' }, 'sad')!;
    const blush = voiceFor({ s: 'yuri' }, 'blush')!;
    expect(angry.pitch).toBeLessThan(base.pitch);
    expect(angry.charMs).toBeLessThan(base.charMs);
    expect(surprised.pitch).toBeGreaterThan(base.pitch);
    expect(sad.pitch).toBeLessThan(base.pitch);
    expect(sad.charMs).toBeGreaterThan(base.charMs);
    expect(blush.volume).toBeLessThan(base.volume);
    expect(blush.charMs).toBeLessThan(base.charMs);
  });
});
