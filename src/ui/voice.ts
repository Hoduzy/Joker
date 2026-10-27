import type { Voice } from '../data/voices';
import { audioSettings, sfxOutput } from './audio';

/**
 * 대사 말소리 (언더테일·동물의 숲처럼 글자마다 짧은 소리).
 * 효과음과 같은 볼륨 버스를 쓰고, 설정의 '말소리'를 끄면 나지 않는다.
 * 한 대사의 소리는 모두 lineBus를 거쳐서, 탭해서 대사를 한 번에 띄우면 cutVoice()로 울림까지 바로 끊는다.
 */
let lineBus: GainNode | null = null;
let lineCtx: AudioContext | null = null;
const impulses = new Map<string, AudioBuffer>();
const crushCurves = new Map<number, Float32Array>();

function bus(): { ctx: AudioContext; out: GainNode } | null {
  if (!audioSettings().voice) return null;
  const o = sfxOutput();
  if (!o) return null;
  if (!lineBus || lineCtx !== o.ctx) {
    lineCtx = o.ctx;
    lineBus = o.ctx.createGain();
    lineBus.connect(o.bus);
  }
  return { ctx: o.ctx, out: lineBus };
}

/** 메아리용 울림: 점점 작아지는 노이즈 (길이별로 한 번만 만든다) */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds}`;
  let buf = impulses.get(key);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * seconds);
    buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    impulses.set(key, buf);
  }
  return buf;
}

/** 비트크러시: 파형을 몇 단계 계단으로 깎는다 (crush가 클수록 단계가 적다) */
function crushCurve(amount: number): Float32Array {
  const steps = Math.max(2, Math.round(16 - amount * 13));
  let curve = crushCurves.get(steps);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    crushCurves.set(steps, curve);
  }
  return curve;
}

/** 말소리 한 번. lift: 음높이 배율 (물음표로 끝날 때 마지막 소리) */
export function blip(v: Voice, lift = 1): void {
  const b = bus();
  if (!b) return;
  const { ctx, out } = b;
  const t0 = ctx.currentTime;
  const freq = v.pitch * lift * (1 + (Math.random() * 2 - 1) * v.jitter);
  const dur = v.length;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, v.volume * 0.5), t0 + Math.min(0.006, dur / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const oscs: OscillatorNode[] = [];
  const tone = (type: OscillatorType, f: number, gain: number, through?: AudioNode) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * (1 - v.bounce * 0.5), t0);
    // 통통: 소리 안에서 음이 위로 튀어 오른다
    if (v.bounce) o.frequency.exponentialRampToValueAtTime(f * (1 + v.bounce), t0 + dur * 0.7);
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(through ?? env);
    oscs.push(o);
  };
  tone(v.wave, freq, 1);
  if (v.crush) {
    // 같은 높이의 삼각파를 계단처럼 깎아 섞는다: 무표정한 기계 느낌
    const shaper = ctx.createWaveShaper();
    shaper.curve = crushCurve(v.crush) as Float32Array<ArrayBuffer>;
    shaper.connect(env);
    tone('triangle', freq, v.crush, shaper);
  }
  // 반짝이는 배음 (두 옥타브 위)
  if (v.sparkle) tone('sine', freq * 4, v.sparkle * 0.35);

  env.connect(out);
  if (v.reverb) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, v.reverb);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    env.connect(conv).connect(wet).connect(out);
  }
  for (const o of oscs) {
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

/** 지금 울리는 말소리를 (메아리까지) 바로 끊는다 */
export function cutVoice(): void {
  if (!lineBus || !lineCtx) return;
  const old = lineBus;
  const now = lineCtx.currentTime;
  old.gain.cancelScheduledValues(now);
  old.gain.setValueAtTime(old.gain.value, now);
  old.gain.linearRampToValueAtTime(0, now + 0.03);
  window.setTimeout(() => old.disconnect(), 80);
  lineBus = null;
}
