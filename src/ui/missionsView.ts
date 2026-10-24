import type { Game } from '../core/game';
import { isMissionDone, missionDef } from '../core/missions';
import { BALANCE } from '../data/balance';
import { h, onTap } from './dom';
import { popNumber, sparkle } from './fx';
import { openModal } from './modal';
import { sfx } from './sfx';

/** 일일 미션 창. 하나 달성할 때마다 전파석, 전부 받으면 올클리어 보너스 */
export function openMissions(game: Game): void {
  game.advance();
  const body = h('div', { class: 'missions' });

  function render() {
    const m = game.state.missions;
    const rows = m.ids.map((id) => {
      const def = missionDef(id)!;
      const n = Math.min(def.goal, m.progress[id] ?? 0);
      const done = isMissionDone(game.state, id);
      const claimed = m.claimed.includes(id);
      const fill = h('div', { class: 'progress__fill' });
      fill.style.width = `${(n / def.goal) * 100}%`;
      const btn = h('button', { class: `btn btn--small ${done && !claimed ? 'btn--primary' : 'btn--ghost'}`, type: 'button', disabled: !done || claimed, 'data-sfx': 'none' }, claimed ? '완료 ✓' : `💎 ${BALANCE.missions.stonesEach}`);
      onTap(btn, () => {
        if (!game.claimMission(id)) return;
        sfx.coin();
        popNumber(btn, `💎 +${BALANCE.missions.stonesEach}`);
        render();
      });
      return h('div', { class: `mission${claimed ? ' is-claimed' : done ? ' is-done' : ''}` }, h('div', { class: 'mission__text' }, h('strong', {}, def.label), h('div', { class: 'progress' }, fill), h('small', {}, `${n} / ${def.goal}`)), btn);
    });
    const all = m.ids.length > 0 && m.ids.every((id) => m.claimed.includes(id));
    const bonus = h(
      'button',
      { class: `btn ${all && !m.bonusClaimed ? 'btn--primary' : 'btn--ghost'} missions__bonus`, type: 'button', disabled: !all || m.bonusClaimed, 'data-sfx': 'none' },
      h('span', {}, m.bonusClaimed ? '오늘 올클리어 완료 🎉' : '올클리어 보너스'),
      h('span', { class: 'btn__sub' }, `💎 ${BALANCE.missions.allClearStones} · 🔧 키트 ${BALANCE.missions.allClearKits}`),
    );
    onTap(bonus, () => {
      if (!game.claimMissionBonus()) return;
      sfx.grade(4);
      sparkle(bonus, 24);
      popNumber(bonus, `💎 +${BALANCE.missions.allClearStones}`);
      render();
    });
    body.replaceChildren(h('p', { class: 'missions__note' }, '매일 0시에 바뀌어요. 택배·대결은 매일 나와요.'), ...rows, bonus);
  }
  render();
  openModal({ title: '📋 오늘의 미션', body, confirmLabel: '닫기', confirmGhost: true });
}
