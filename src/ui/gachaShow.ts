import type { PullResult } from '../core/gacha';
import { BALANCE } from '../data/balance';
import { getMember } from '../data/members';
import { cardFrame } from './cardView';
import { h, onTap } from './dom';
import { lightPillar, sparkle } from './fx';
import { sfx } from './sfx';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface ShowOptions {
  canPullAgain: () => boolean;
  againLabel: string;
}

/**
 * 뽑기 연출: 엽서가 날아와 쌓이고, 한 장씩 뒤집힌다. SSR이 뒤집히면 화면이 반짝인다.
 * 엽서를 탭하면 바로 뒤집히고, '모두 넘기기'로 건너뛸 수 있다.
 * 반환값: '한 번 더'를 눌렀으면 true
 */
export function playPullAnimation(results: PullResult[], opts: ShowOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const many = results.length > 1;
    const flash = h('div', { class: 'pull__flash' });
    const stage = h('div', { class: `pull__stage${many ? ' pull__stage--many' : ''}` });
    const skip = h('button', { class: 'btn btn--ghost pull__skip', type: 'button' }, '모두 넘기기');
    const actions = h('div', { class: 'pull__actions' });
    const root = h('div', { class: 'pull', role: 'dialog', 'aria-modal': 'true', 'aria-label': '뽑기 결과' }, flash, h('div', { class: 'pull__stars' }), stage, h('div', { class: 'pull__footer' }, skip, actions));

    const fast = reducedMotion();
    const cards = results.map((r, i) => {
      const member = getMember(r.card.member);
      const back = h(
        'div',
        { class: 'postcard__back' },
        h('div', { class: 'postcard__stamp' }, h('span', {}, '심야'), h('span', {}, '방송부')),
        h('div', { class: 'postcard__lines' }, h('i'), h('i'), h('i')),
        h('div', { class: 'postcard__to' }, 'TO. 심야방송부'),
      );
      const note = r.isNew
        ? h('span', { class: 'pull__badge pull__badge--new' }, 'NEW')
        : r.refund > 0
          ? h('span', { class: 'pull__badge' }, `전파석 +${r.refund}`)
          : h('span', { class: 'pull__badge pull__badge--lb' }, `돌파 ${r.limitBreak}/${BALANCE.limitBreak.max}`);
      const front = h(
        'div',
        { class: 'postcard__front' },
        cardFrame(r.card, { size: many ? 'md' : 'lg', limitBreak: r.limitBreak }),
        note,
        r.pickup ? h('span', { class: 'pull__pickup' }, 'PICK UP') : null,
      );
      const el = h('button', { class: `postcard postcard--${r.card.rarity}`, type: 'button', 'aria-label': `${i + 1}번째 엽서 뒤집기` }, h('div', { class: 'postcard__inner' }, back, front));
      // 화면 밖 여기저기서 날아오게
      const angle = (i * 137) % 360;
      el.style.setProperty('--fx', `${Math.cos((angle * Math.PI) / 180) * 70}vw`);
      el.style.setProperty('--fy', `${-60 - (i % 3) * 15}vh`);
      el.style.setProperty('--fr', `${((i * 53) % 70) - 35}deg`);
      el.style.setProperty('--delay', `${fast ? 0 : i * 90}ms`);
      el.title = member?.name ?? '';
      stage.append(el);
      return { el, result: r, flipped: false };
    });

    const flip = (c: (typeof cards)[number]) => {
      if (c.flipped) return;
      c.flipped = true;
      c.el.classList.add('is-flipped');
      c.el.setAttribute('aria-label', `${getMember(c.result.card.member)?.name} ${c.result.card.title} (${c.result.card.rarity})`);
      const rarity = c.result.card.rarity;
      if (!skipping) sfx.grade(rarity === 'SSR' ? 5 : rarity === 'SR' ? 3 : 1);
      if (rarity === 'SSR') {
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
        sparkle(c.el);
        if (!skipping) lightPillar('#ffd76b', true);
      }
      if (cards.every((x) => x.flipped)) finish();
    };
    cards.forEach((c) => onTap(c.el, () => flip(c)));

    let skipping = false;
    onTap(skip, () => {
      skipping = true;
      const rest = cards.filter((c) => !c.flipped).map((c) => c.result.card.rarity);
      cards.forEach(flip);
      // 한꺼번에 넘기면 가장 높은 등급 소리 한 번만
      if (rest.includes('SSR')) {
        sfx.grade(5);
        lightPillar('#ffd76b', true);
      } else if (rest.length) sfx.grade(rest.includes('SR') ? 3 : 1);
    });

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      skip.hidden = true;
      const close = h('button', { class: 'btn btn--ghost', type: 'button' }, '확인');
      onTap(close, () => done(false));
      actions.append(close);
      if (opts.canPullAgain()) {
        const again = h('button', { class: 'btn btn--primary', type: 'button' }, opts.againLabel);
        onTap(again, () => done(true));
        actions.append(again);
      }
    }

    function done(again: boolean) {
      root.classList.add('is-closing');
      setTimeout(() => root.remove(), fast ? 0 : 200);
      resolve(again);
    }

    document.body.append(root);

    // 날아오는 연출이 끝나면 차례로 뒤집는다
    (async () => {
      await sleep(fast ? 50 : 650 + (results.length - 1) * 90);
      for (const c of cards) {
        if (skipping || finished) break;
        if (c.flipped) continue;
        // 높은 등급일수록 뒤집기 전에 뜸을 들인다
        const wait = c.result.card.rarity === 'SSR' ? 700 : c.result.card.rarity === 'SR' ? 380 : 220;
        if (c.result.card.rarity !== 'R') c.el.classList.add('is-charging');
        await sleep(fast ? 0 : wait);
        if (skipping) break;
        flip(c);
      }
    })();
  });
}
