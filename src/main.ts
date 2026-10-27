import { Game } from './core/game';
import { mountApp } from './ui/app';
import { showTitleScreen } from './ui/titleScreen';
import { mountAdminGear } from './ui/admin';
import './style.css';
import './event.css';
import './admin.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app 요소가 없습니다');

const game = new Game();
mountApp(root, game);
showTitleScreen(game);
// 관리자 모드를 켜 둔 기기면 구석에 톱니 버튼
mountAdminGear(game);

// iOS 사파리에서 :active 스타일이 동작하도록 빈 touchstart 리스너를 건다.
document.addEventListener('touchstart', () => {}, { passive: true });

if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
