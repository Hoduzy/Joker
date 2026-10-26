/**
 * 소리 전체: 하나의 AudioContext에 배경음악(BGM)·효과음(SFX) 볼륨을 따로 두고, 음소거·볼륨은 기기별로 저장한다.
 *
 * 배경음악
 * - assets/bgm/<id>.mp3 를 <audio> 두 개(덱 A·B)로 번갈아 틀어 1초 크로스페이드. 같은 곡이면 끊지 않고 계속.
 * - 아이패드 사파리는 첫 터치 전엔 소리를 못 낸다 → 첫 터치 때 AudioContext를 깨우고 두 덱을 '허락받아' 둔다.
 *   그 전에 요청한 곡은 기억해 두었다가 첫 터치 때 시작.
 * - 앱이 백그라운드로 가면 멈추고, 돌아오면 이어서.
 * - iOS는 <audio>.volume을 바꿀 수 없어서, 볼륨·페이드는 Web Audio GainNode로 한다.
 */
const KEY = 'simya-bangsongbu/audio';
const OLD_SOUND_KEY = 'simya-bangsongbu/sound';
const FADE = 1;
/** 볼륨 100%일 때 실제 세기 (Suno 곡은 크게 마스터링돼 있어 낮춰 둔다) */
const BGM_MAX = 0.55;
const SFX_MAX = 0.6;

export const BGM_TRACKS = ['main', 'title', 'daily', 'comic', 'calm', 'mystery', 'sad', 'battle', 'romance', 'flashback', 'climax', 'ending'] as const;
export type BgmId = (typeof BGM_TRACKS)[number];

const files = import.meta.glob('/assets/bgm/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URLS = new Map<string, string>();
for (const [file, url] of Object.entries(files)) {
  const m = /\/assets\/bgm\/([^/]+)\.mp3$/.exec(file);
  if (m) URLS.set(m[1], url);
}

export interface AudioSettings {
  /** 0~1 */
  bgm: number;
  sfx: number;
  muted: boolean;
}

let settings: AudioSettings = readSettings();

function readSettings(): AudioSettings {
  const base: AudioSettings = { bgm: 0.7, sfx: 0.8, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AudioSettings>;
      const vol = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
      return { bgm: vol(s.bgm, base.bgm), sfx: vol(s.sfx, base.sfx), muted: s.muted === true };
    }
    // 예전 '효과음 끄기' 설정은 음소거로 옮긴다
    if (localStorage.getItem(OLD_SOUND_KEY) === 'off') return { ...base, muted: true };
  } catch {
    // 무시
  }
  return base;
}

function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 무시
  }
}

export const audioSettings = (): Readonly<AudioSettings> => settings;

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  settings = { ...settings, ...patch };
  saveSettings();
  applyVolumes();
}

// ── AudioContext
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let bgmBus: GainNode | null = null;

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  /** 페이드아웃 뒤 멈추기 예약이 겹치지 않게 */
  token: number;
}
const decks: Deck[] = [];
let current: Deck | null = null;
let currentId: BgmId | null = null;
/** 지금 틀고 싶은 곡 (첫 터치 전에 요청한 것 포함) */
let wanted: BgmId | null = null;
let unlocked = false;

/** 효과음이 쓸 곳. 소리를 낼 수 없으면 null */
export function sfxOutput(): { ctx: AudioContext; bus: GainNode } | null {
  if (!ctx || !sfxBus || settings.muted || settings.sfx <= 0) return null;
  return { ctx, bus: sfxBus };
}

function applyVolumes() {
  if (!ctx || !sfxBus || !bgmBus) return;
  const now = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(settings.muted ? 0 : settings.sfx * SFX_MAX, now, 0.03);
  bgmBus.gain.setTargetAtTime(settings.muted ? 0 : settings.bgm * BGM_MAX, now, 0.05);
}

/** 짧은 무음 WAV (덱을 첫 터치 때 '허락받는' 용도) */
function silentWav(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  let bin = '';
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function createContext(): boolean {
  if (ctx) return true;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    sfxBus = ctx.createGain();
    bgmBus = ctx.createGain();
    sfxBus.connect(ctx.destination);
    bgmBus.connect(ctx.destination);
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(bgmBus);
      decks.push({ el, gain, token: 0 });
    }
    applyVolumes();
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

/** 첫 터치(또는 키 입력) 때: 소리를 깨우고, 기다리던 곡을 시작 */
export function unlockAudio(): void {
  if (!createContext() || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  if (unlocked) return;
  unlocked = true;
  const silence = silentWav();
  for (const d of decks) {
    // 사용자 동작 안에서 한 번 재생해 두면, 나중에 곡을 바꿔 틀어도 막히지 않는다
    if (!d.el.src) {
      d.el.src = silence;
      d.el.play().then(
        () => d !== current && d.el.pause(),
        () => {},
      );
    }
  }
  if (wanted) {
    const w = wanted;
    wanted = null;
    playBgm(w);
  }
}

function fadeTo(d: Deck, target: number) {
  if (!ctx) return;
  const now = ctx.currentTime;
  d.gain.gain.cancelScheduledValues(now);
  d.gain.gain.setValueAtTime(d.gain.gain.value, now);
  d.gain.gain.linearRampToValueAtTime(target, now + FADE);
}

/** 곡 바꾸기 (null이면 페이드아웃해서 조용히). 같은 곡이면 그대로 계속 */
export function playBgm(id: BgmId | null): void {
  wanted = id;
  if (!unlocked || !ctx) return;
  if (id === currentId) return;
  const old = current;
  if (old) {
    fadeTo(old, 0);
    const token = ++old.token;
    window.setTimeout(() => {
      if (old.token === token && old !== current) old.el.pause();
    }, FADE * 1000 + 80);
  }
  current = null;
  currentId = id;
  const url = id && URLS.get(id);
  if (!id || !url) return;
  const deck = decks.find((d) => d !== old) ?? decks[0];
  deck.token++;
  deck.gain.gain.cancelScheduledValues(ctx.currentTime);
  deck.gain.gain.setValueAtTime(0, ctx.currentTime);
  const abs = new URL(url, location.href).href;
  if (deck.el.src !== abs) deck.el.src = abs;
  deck.el.currentTime = 0;
  current = deck;
  void deck.el.play().catch(() => {});
  fadeTo(deck, 1);
}

export const currentBgm = (): BgmId | null => currentId;

/** el이 화면에 있는 동안 id를 틀고, 사라지면 then(기본 main)으로 */
export function bgmWhile(el: HTMLElement, id: BgmId, then: BgmId = 'main'): void {
  playBgm(id);
  const watch = new MutationObserver(() => {
    if (el.isConnected) return;
    watch.disconnect();
    if (currentId === id) playBgm(then);
  });
  watch.observe(document.body, { childList: true, subtree: true });
}

/** 첫 터치에 소리 깨우기 + 백그라운드에선 멈추기 */
export function installAudio(): void {
  const wake = () => unlockAudio();
  // 사파리에서 '사용자 동작'으로 인정되는 이벤트들
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, wake, { capture: true });
  const pause = () => {
    current?.el.pause();
    if (ctx?.state === 'running') void ctx.suspend();
  };
  const resume = () => {
    if (!unlocked || !ctx) return;
    void ctx.resume();
    if (current) void current.el.play().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', () => !document.hidden && resume());
}

// 개발 서버에서만: 지금 소리 상태를 들여다보는 창구 (브라우저 테스트용)
if (import.meta.env.DEV) {
  (window as unknown as { __audio: unknown }).__audio = () => ({
    unlocked,
    ctx: ctx?.state,
    current: currentId,
    bus: bgmBus?.gain.value,
    decks: decks.map((d) => ({ src: d.el.src.split('/').pop()?.slice(0, 14), paused: d.el.paused, t: Math.round(d.el.currentTime * 10) / 10, gain: Math.round(d.gain.gain.value * 100) / 100 })),
  });
}
