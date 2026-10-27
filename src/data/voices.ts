import raw from './voices.json';
import { getMember } from './members';

/** 대사 말소리 설정 (voices.json). 부원·표정에 맞춰 계산한 값 */
export const VOICE_WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export type VoiceWave = (typeof VOICE_WAVES)[number];

export interface Voice {
  wave: VoiceWave;
  pitch: number;
  length: number;
  volume: number;
  every: number;
  charMs: number;
  jitter: number;
  bounce: number;
  crush: number;
  sparkle: number;
  reverb: number;
}

type Partial2<T> = { [K in keyof T]?: T[K] };
interface RawVoices {
  defaults: Voice;
  pause: number;
  questionLift: number;
  members: Record<string, Partial2<Voice>>;
  aliases: Record<string, string>;
  emotions: Record<string, { pitch?: number; volume?: number; speed?: number }>;
}

const data = raw as unknown as RawVoices;

function fail(msg: string): never {
  throw new Error(`voices.json: ${msg}`);
}

/** 숫자 범위·파형을 확인해서 읽어 둔다 (잘못 쓰면 어디가 틀렸는지 알려 준다) */
function check(v: Voice, where: string): Voice {
  if (!(VOICE_WAVES as readonly string[]).includes(v.wave)) fail(`${where}.wave는 ${VOICE_WAVES.join('/')} 중 하나여야 합니다 ("${v.wave}")`);
  const range: [keyof Voice, number, number][] = [
    ['pitch', 40, 4000],
    ['length', 0.005, 0.5],
    ['volume', 0, 1],
    ['every', 1, 8],
    ['charMs', 10, 200],
    ['jitter', 0, 0.5],
    ['bounce', 0, 1],
    ['crush', 0, 1],
    ['sparkle', 0, 1],
    ['reverb', 0, 5],
  ];
  for (const [k, lo, hi] of range) {
    const n = v[k];
    if (typeof n !== 'number' || n < lo || n > hi) fail(`${where}.${k}는 ${lo}~${hi} 사이 숫자여야 합니다 (${String(n)})`);
  }
  return v;
}

const MEMBER_VOICES: Record<string, Voice> = {};
for (const [id, v] of Object.entries(data.members)) {
  if (!getMember(id)) fail(`members에 알 수 없는 부원 "${id}"`);
  MEMBER_VOICES[id] = check({ ...data.defaults, ...v }, `members.${id}`);
}
for (const [name, id] of Object.entries(data.aliases ?? {})) if (!MEMBER_VOICES[id]) fail(`aliases.${name}: "${id}"의 목소리가 없습니다`);

/** 마침표·물음표 뒤에 쉬는 시간 (ms) */
export const VOICE_PAUSE_MS = data.pause;
/** 물음표로 끝나는 대사의 마지막 소리 높이 배율 */
export const QUESTION_LIFT = data.questionLift;

/**
 * 말하는 사람(s: 부원 id, n: 이름표)과 표정으로 목소리를 고른다.
 * 나레이션·주인공·목소리가 없는 사람은 null (소리 없음)
 */
export function voiceFor(speaker: { s?: string; n?: string }, expr?: string): Voice | null {
  const id = speaker.s && speaker.s !== 'me' ? speaker.s : speaker.n ? data.aliases?.[speaker.n] : undefined;
  const base = id ? MEMBER_VOICES[id] : undefined;
  if (!base) return null;
  const e = expr ? data.emotions?.[expr] : undefined;
  if (!e) return base;
  const speed = e.speed ?? 1;
  return {
    ...base,
    pitch: base.pitch * (e.pitch ?? 1),
    volume: Math.min(1, base.volume * (e.volume ?? 1)),
    charMs: base.charMs / speed,
    length: base.length / speed,
  };
}
