/**
 * 효과음. 파일 없이 Web Audio로 그 자리에서 합성한다.
 * 브라우저는 첫 터치 전에는 소리를 못 내므로, 첫 터치 때 AudioContext를 깨운다.
 * 볼륨·음소거는 audio.ts (배경음악과 같은 AudioContext, 효과음 볼륨은 따로).
 */
import { installAudio, sfxOutput } from './audio';

/** 첫 터치에 소리를 깨우고(배경음악 포함), 모든 버튼에 가벼운 탭 소리를 붙인다 */
export function installSfx(): void {
  installAudio();
  document.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement | null)?.closest?.('button');
      if (btn && !btn.disabled && !btn.hasAttribute('data-sfx')) sfx.tap();
    },
    { capture: true },
  );
}

interface Tone {
  freq: number;
  /** 끝 주파수 (미끄러지는 소리) */
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  /** 시작 지연 (초) */
  at?: number;
}

function tone({ freq, to, dur, type = 'sine', vol = 0.3, at = 0 }: Tone): void {
  const out = sfxOutput();
  if (!out) return;
  const { ctx, bus: master } = out;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.2, at = 0, filterFreq = 1800): void {
  const out = sfxOutput();
  if (!out) return;
  const { ctx, bus: master } = out;
  const t0 = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

const arp = (notes: number[], step: number, opts: Omit<Tone, 'freq'>) => notes.forEach((f, i) => tone({ ...opts, freq: f, at: (opts.at ?? 0) + i * step }));

// 음 이름 → 주파수
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093;

/**
 * 라디오 다이얼 돌리는 소리: 지지직 노이즈의 대역을 이리저리 쓸어 가며, 중간중간 방송 조각(삐— 하는 음)이 스친다.
 * dur초 동안. unstable이면 끝까지 잦아들지 않고 흔들린다. 돌려받은 함수를 부르면 바로 멈춘다.
 */
function tuningNoise(dur: number, unstable: boolean): () => void {
  const out = sfxOutput();
  if (!out) return () => {};
  const { ctx: c, bus: master } = out;
  const t0 = c.currentTime;
  const len = Math.floor(c.sampleRate * (dur + 0.2));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.2;
  // 다이얼을 돌리는 것처럼 대역을 이리저리
  band.frequency.setValueAtTime(500, t0);
  const steps = 7;
  for (let i = 1; i <= steps; i++) band.frequency.linearRampToValueAtTime(400 + Math.random() * 3200, t0 + (dur * i) / steps);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.08);
  if (unstable) {
    gain.gain.linearRampToValueAtTime(0.12, t0 + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0.09, t0 + dur);
  } else {
    gain.gain.setValueAtTime(0.22, t0 + dur * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  src.connect(band).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.2);
  // 스쳐 가는 방송 조각
  const blips: OscillatorNode[] = [];
  for (let i = 0; i < 3; i++) {
    const at = t0 + dur * (0.15 + i * 0.22) + Math.random() * 0.05;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(600 + Math.random() * 900, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.14);
    blips.push(o);
  }
  return () => {
    const now = c.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      src.stop(now + 0.1);
      blips.forEach((b) => b.stop(now + 0.01));
    } catch {
      // 이미 끝남
    }
  };
}

/**
 * 방송사고 다이얼용 라디오 소리: 계속 도는 지지직 노이즈 + 맞출수록 또렷해지는 신호음.
 * set(0~1)로 신호 세기를 바꾸고, stop()으로 멈춘다
 */
export function staticRadio(): { set(strength: number): void; stop(): void } {
  const out = sfxOutput();
  if (!out) return { set() {}, stop() {} };
  const { ctx: c, bus } = out;
  const t0 = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  band.Q.value = 0.9;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.08);
  src.connect(band).connect(noiseGain).connect(bus);
  // 신호음: 방송 캐리어 같은 두 음. 멀리 있을수록 음이 흔들리고 작다
  const toneGain = c.createGain();
  toneGain.gain.value = 0;
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  o1.type = 'sine';
  o2.type = 'triangle';
  o1.frequency.value = 523.25;
  o2.frequency.value = 784;
  o1.connect(toneGain);
  o2.connect(toneGain);
  toneGain.connect(bus);
  src.start(t0);
  o1.start(t0);
  o2.start(t0);
  let stopped = false;
  return {
    set(strength: number) {
      if (stopped) return;
      const now = c.currentTime;
      const s = Math.max(0, Math.min(1, strength));
      noiseGain.gain.setTargetAtTime(0.02 + 0.2 * (1 - s), now, 0.05);
      band.frequency.setTargetAtTime(900 + Math.random() * 1600 * (1 - s), now, 0.08);
      toneGain.gain.setTargetAtTime(0.09 * s * s, now, 0.05);
      const wob = (1 - s) * 40 * Math.sin(now * 9);
      o1.frequency.setTargetAtTime(523.25 + wob, now, 0.03);
      o2.frequency.setTargetAtTime(784 + wob * 1.5, now, 0.03);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      try {
        noiseGain.gain.setTargetAtTime(0.0001, now, 0.04);
        toneGain.gain.setTargetAtTime(0.0001, now, 0.04);
        src.stop(now + 0.25);
        o1.stop(now + 0.25);
        o2.stop(now + 0.25);
      } catch {
        // 이미 끝남
      }
    },
  };
}

export const sfx = {
  /** 방송사고 경고음: 높낮이 두 음을 세 번 */
  alarm() {
    for (let i = 0; i < 3; i++) {
      tone({ freq: 988, dur: 0.12, type: 'square', vol: 0.1, at: i * 0.32 });
      tone({ freq: 740, dur: 0.12, type: 'square', vol: 0.1, at: i * 0.32 + 0.15 });
    }
    noise(0.35, 0.18, 0, 2400);
  },
  /** 다이얼 딸깍 */
  dialTick() {
    tone({ freq: 2400, to: 1800, dur: 0.018, type: 'square', vol: 0.05 });
  },
  /** 주파수가 딱 맞았을 때 짧은 확인음 */
  locked() {
    arp([C6, G6], 0.05, { dur: 0.1, type: 'sine', vol: 0.12 });
  },
  /** 방송사고 판정음: perfect는 화려하게 */
  tuneResult(grade: 'perfect' | 'good' | 'barely' | 'fail') {
    if (grade === 'perfect') {
      arp([C5, E5, G5, C6, E6, G6, C7], 0.05, { dur: 0.35, type: 'square', vol: 0.13 });
      [C6, E6, G6].forEach((f) => tone({ freq: f, dur: 1.1, type: 'triangle', vol: 0.14, at: 0.35 }));
      arp([C7, G6, C7, E6, C7], 0.07, { dur: 0.12, type: 'sine', vol: 0.1, at: 0.45 });
    } else if (grade === 'good') {
      arp([C5, E5, G5, C6], 0.08, { dur: 0.22, type: 'square', vol: 0.12 });
      tone({ freq: C6, dur: 0.6, type: 'triangle', vol: 0.12, at: 0.32 });
    } else if (grade === 'barely') {
      arp([E5, G5], 0.1, { dur: 0.2, type: 'triangle', vol: 0.15 });
    } else {
      noise(0.4, 0.22, 0, 900);
      arp([G5, E5, C5], 0.16, { dur: 0.28, type: 'triangle', vol: 0.16, at: 0.1 });
    }
  },
  tap() {
    tone({ freq: 880, to: 1200, dur: 0.05, type: 'triangle', vol: 0.12 });
  },
  /** 택배 상자 뜯기 */
  boxOpen() {
    noise(0.18, 0.35, 0, 1200);
    tone({ freq: 220, to: 440, dur: 0.15, type: 'square', vol: 0.08 });
  },
  /**
   * 등급별 획득음. rank 0(일반)~5(신화). 카드는 R=1, SR=3, SSR=5로 부른다.
   * 높을수록 음이 많고 크고 길다
   */
  grade(rank: number) {
    if (rank <= 0) return tone({ freq: G5, dur: 0.15, type: 'triangle', vol: 0.15 });
    if (rank === 1) return arp([E5, G5], 0.07, { dur: 0.18, type: 'triangle', vol: 0.18 });
    if (rank === 2) return arp([C5, E5, G5], 0.07, { dur: 0.22, type: 'triangle', vol: 0.22 });
    if (rank === 3) return arp([C5, E5, G5, C6], 0.07, { dur: 0.3, type: 'square', vol: 0.12 });
    if (rank === 4) {
      arp([C5, E5, G5, C6, E6, G6], 0.06, { dur: 0.35, type: 'square', vol: 0.14 });
      tone({ freq: 130, to: 65, dur: 0.6, type: 'sawtooth', vol: 0.25 });
      return;
    }
    // 신화: 쿵 + 쏟아지는 화음 + 반짝이
    tone({ freq: 110, to: 40, dur: 0.9, type: 'sawtooth', vol: 0.4 });
    noise(0.5, 0.4, 0, 500);
    arp([C5, E5, G5, C6, E6, G6, C7], 0.05, { dur: 0.6, type: 'square', vol: 0.16, at: 0.1 });
    [C6, E6, G6].forEach((f) => tone({ freq: f, dur: 1.4, type: 'triangle', vol: 0.15, at: 0.5 }));
    arp([C7, G6, C7, E6, C7], 0.08, { dur: 0.12, type: 'sine', vol: 0.12, at: 0.6 });
  },
  /**
   * U 등급 등장: 낮게 깔리는 오르간 같은 단조 화음 → 호박등이 하나씩 켜지는 '퐁' → 반짝이는 장조로 풀린다.
   * (할로윈처럼 으스스하다가 밝아지게)
   */
  uReveal() {
    tone({ freq: 55, to: 41, dur: 1.6, type: 'sawtooth', vol: 0.3 });
    [220, 261.63, 311.13].forEach((f) => tone({ freq: f, dur: 1.1, type: 'triangle', vol: 0.12 }));
    noise(0.9, 0.18, 0.1, 400);
    // 호박등 셋: 낮은 음부터
    [392, 466.16, 587.33].forEach((f, i) => tone({ freq: f, to: f * 1.5, dur: 0.18, type: 'sine', vol: 0.2, at: 0.7 + i * 0.22 }));
    // 카드 등장
    tone({ freq: 98, to: 49, dur: 0.8, type: 'square', vol: 0.18, at: 1.45 });
    arp([C5, E5, G5, C6, E6, G6, C7], 0.05, { dur: 0.6, type: 'square', vol: 0.14, at: 1.5 });
    [C6, E6, G6, C7].forEach((f) => tone({ freq: f, dur: 1.6, type: 'triangle', vol: 0.12, at: 1.85 }));
    arp([C7, G6, E6, G6, C7], 0.09, { dur: 0.14, type: 'sine', vol: 0.1, at: 2 });
  },
  enhanceSuccess() {
    arp([C5, G5, C6, E6], 0.06, { dur: 0.25, type: 'triangle', vol: 0.22 });
    tone({ freq: C7, dur: 0.4, type: 'sine', vol: 0.1, at: 0.25 });
  },
  enhanceFail() {
    tone({ freq: 330, to: 180, dur: 0.35, type: 'sawtooth', vol: 0.15 });
    tone({ freq: 250, to: 120, dur: 0.4, type: 'sawtooth', vol: 0.12, at: 0.12 });
  },
  victory() {
    arp([C5, E5, G5], 0.11, { dur: 0.16, type: 'square', vol: 0.14 });
    [C6, E6, G6].forEach((f) => tone({ freq: f, dur: 0.9, type: 'square', vol: 0.1, at: 0.36 }));
  },
  defeat() {
    arp([G5, E5, C5], 0.18, { dur: 0.3, type: 'triangle', vol: 0.18 });
  },
  /** 대결 중 줄다리기 한 번 당김 */
  pull() {
    noise(0.06, 0.18, 0, 2600);
    tone({ freq: 300 + Math.random() * 200, dur: 0.06, type: 'square', vol: 0.06 });
  },
  /** 호감도·미션·문자 알림 */
  chime() {
    arp([E6, A5 * 2], 0.09, { dur: 0.25, type: 'sine', vol: 0.18 });
  },
  levelUp() {
    arp([C5, E5, G5, C6], 0.08, { dur: 0.2, type: 'triangle', vol: 0.2 });
  },
  coin() {
    arp([E6, G6 * 1.0], 0.05, { dur: 0.12, type: 'square', vol: 0.08 });
  },

  // ── 스토리 연출
  /** 통통 (jump): 위로 미끄러지는 짧은 소리 두 번 */
  hop() {
    tone({ freq: 380, to: 760, dur: 0.11, type: 'sine', vol: 0.2 });
    tone({ freq: 440, to: 880, dur: 0.1, type: 'sine', vol: 0.14, at: 0.2 });
  },
  /** 부르르 (shake) */
  wobble() {
    [0, 0.05, 0.1, 0.15].forEach((at, i) => tone({ freq: i % 2 ? 260 : 210, dur: 0.05, type: 'triangle', vol: 0.12, at }));
  },
  /** 화면 흔들림: 낮게 쿵 */
  thud(big = false) {
    tone({ freq: big ? 120 : 160, to: big ? 38 : 60, dur: big ? 0.5 : 0.25, type: 'sine', vol: big ? 0.45 : 0.3 });
    noise(big ? 0.35 : 0.15, big ? 0.35 : 0.2, 0, 260);
  },
  /** 하얀 섬광 */
  flash() {
    noise(0.35, 0.12, 0, 5200);
    tone({ freq: C6, to: C7, dur: 0.35, type: 'sine', vol: 0.08 });
  },
  /** 타이틀 카드: 다이얼 돌리는 지지직 (멈추는 함수를 돌려준다) */
  tuning(dur: number, unstable = false): () => void {
    return tuningNoise(dur, unstable);
  },
  /** 주파수가 딱 맞았을 때: 짧은 딸깍 + 맑은 음 */
  tuned() {
    noise(0.03, 0.25, 0, 3000);
    tone({ freq: 1320, dur: 0.18, type: 'sine', vol: 0.1, at: 0.02 });
  },
  /** 끝까지 안 맞을 때: 흔들리는 낮은 음 */
  detuned() {
    tone({ freq: 660, to: 610, dur: 0.5, type: 'sine', vol: 0.06 });
    tone({ freq: 668, to: 700, dur: 0.5, type: 'sine', vol: 0.05 });
  },
  /** 감정 아이콘이 톡 하고 뜰 때. 아이콘마다 조금씩 다르게 */
  emote(kind: string) {
    switch (kind) {
      case 'exclaim':
        return arp([G6, C7], 0.05, { dur: 0.09, type: 'square', vol: 0.08 });
      case 'question':
        return tone({ freq: 600, to: 1100, dur: 0.2, type: 'sine', vol: 0.16 });
      case 'heart':
        return arp([E6, A5 * 2], 0.1, { dur: 0.18, type: 'sine', vol: 0.15 });
      case 'angry':
        return tone({ freq: 180, to: 140, dur: 0.18, type: 'sawtooth', vol: 0.1 });
      case 'music':
        return arp([C6, E6, G6], 0.08, { dur: 0.12, type: 'triangle', vol: 0.13 });
      case 'dots':
        return arp([700, 700, 700], 0.12, { dur: 0.04, type: 'sine', vol: 0.1 });
      case 'sweat':
        return tone({ freq: 1200, to: 500, dur: 0.16, type: 'sine', vol: 0.13 });
      case 'sparkle':
        return arp([C7, G6, E6 * 2], 0.06, { dur: 0.14, type: 'sine', vol: 0.09 });
      default:
        return tone({ freq: 900, to: 1400, dur: 0.08, type: 'sine', vol: 0.14 });
    }
  },
};
