import type { Emote } from '../data/narrative';

/**
 * 머리 위 감정 아이콘. 이미지 없이 SVG로 그린다 (64×64, 둥글고 두꺼운 흰 테두리로 어떤 배경에서도 보이게).
 * 아이콘 안쪽의 작은 움직임(땀 흐르기, 점 깜빡이기 등)은 style.css의 .emote-* 클래스.
 */
const OUT = '#fff';

/** 같은 선을 흰색 굵게 한 번, 색으로 한 번 그려서 테두리를 만든다 */
const line = (d: string, color: string, w = 6) =>
  `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const shape = (d: string, color: string, extra = '') => `<path d="${d}" fill="${color}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round" ${extra}/>`;

const HEART = 'M32 54 C14 42 6 32 8 22 C10 13 21 9 28 15 C30 17 31 18 32 20 C33 18 34 17 36 15 C43 9 54 13 56 22 C58 32 50 42 32 54 Z';
const DROP = (x: number, y: number, s: number) =>
  `M${x} ${y} C${x + 9 * s} ${y + 13 * s} ${x + 12 * s} ${y + 19 * s} ${x + 12 * s} ${y + 24 * s} A${12 * s} ${12 * s} 0 0 1 ${x - 12 * s} ${y + 24 * s} C${x - 12 * s} ${y + 19 * s} ${x - 9 * s} ${y + 13 * s} ${x} ${y} Z`;
const STAR = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z`;

const ART: Record<Emote, string> = {
  sweat:
    `<g class="emote-drip">${shape(DROP(36, 6, 1.45), '#7cc8ff')}<ellipse cx="30" cy="40" rx="4" ry="7" fill="#fff" opacity=".85" transform="rotate(20 30 40)"/></g>` +
    `<g class="emote-drip emote-drip--late">${shape(DROP(14, 22, 0.7), '#a6dbff')}</g>`,
  exclaim:
    line('M10 14 L16 20', '#ffb13d', 4) +
    line('M54 14 L48 20', '#ffb13d', 4) +
    shape('M26 6 h12 a4 4 0 0 1 4 4.4 l-3 30 a4 4 0 0 1 -4 3.6 h-6 a4 4 0 0 1 -4 -3.6 l-3 -30 a4 4 0 0 1 4 -4.4 z', '#ff5f6d') +
    `<circle cx="32" cy="54" r="6.5" fill="#ff5f6d" stroke="${OUT}" stroke-width="5"/>`,
  question: line('M20 20 C20 9 44 7 44 20 C44 29 32 29 32 39', '#ffb547', 8) + `<circle cx="32" cy="53" r="6" fill="#ffb547" stroke="${OUT}" stroke-width="5"/>`,
  heart: `<g class="emote-beat">${shape(HEART, '#ff7aa8')}<ellipse cx="20" cy="22" rx="5" ry="3.5" fill="#fff" opacity=".85" transform="rotate(-35 20 22)"/></g>`,
  angry:
    `<g class="emote-throb">` +
    line('M12 26 Q24 24 26 12', '#ff4d5a', 6) +
    line('M38 12 Q40 24 52 26', '#ff4d5a', 6) +
    line('M52 38 Q40 40 38 52', '#ff4d5a', 6) +
    line('M26 52 Q24 40 12 38', '#ff4d5a', 6) +
    `</g>`,
  music:
    `<g class="emote-bob">` +
    shape('M22 14 L50 7 L50 15 L22 22 Z', '#9b7bff') +
    line('M24 16 L24 44', '#9b7bff', 5) +
    line('M48 10 L48 38', '#9b7bff', 5) +
    `<ellipse cx="18" cy="46" rx="8" ry="6.5" fill="#9b7bff" stroke="${OUT}" stroke-width="5" transform="rotate(-20 18 46)"/>` +
    `<ellipse cx="42" cy="40" rx="8" ry="6.5" fill="#9b7bff" stroke="${OUT}" stroke-width="5" transform="rotate(-20 42 40)"/>` +
    `</g>`,
  dots:
    shape('M10 12 h44 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-24 l-10 10 v-10 h-10 a8 8 0 0 1 -8 -8 v-18 a8 8 0 0 1 8 -8 z', '#ffffff', 'stroke="#4b4867" stroke-width="3.5"') +
    `<g fill="#4b4867"><circle class="emote-dot" cx="20" cy="29" r="4.5"/><circle class="emote-dot" cx="32" cy="29" r="4.5"/><circle class="emote-dot" cx="44" cy="29" r="4.5"/></g>`,
  shy:
    `<ellipse cx="32" cy="34" rx="25" ry="15" fill="#ffb3c4" stroke="${OUT}" stroke-width="5"/>` +
    `<g stroke="#ff5c86" stroke-width="4.5" stroke-linecap="round"><path d="M17 42 L25 26"/><path d="M28 43 L36 27"/><path d="M39 42 L47 26"/></g>`,
  sparkle:
    `<g class="emote-twinkle">${shape(STAR(28, 32, 22), '#ffd84d')}</g>` +
    `<g class="emote-twinkle emote-twinkle--late">${shape(STAR(50, 14, 10), '#fff1a8')}</g>` +
    `<g class="emote-twinkle emote-twinkle--late2">${shape(STAR(52, 48, 7), '#ffe46b')}</g>`,
};

export function emoteSvg(kind: Emote): string {
  return `<svg class="emote emote--${kind}" viewBox="-4 -4 72 72" aria-hidden="true">${ART[kind]}</svg>`;
}
