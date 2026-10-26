import { Game } from './core/game';
import { mountApp } from './ui/app';
import { showTitleScreen } from './ui/titleScreen';
import './style.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app 요소가 없습니다');

const game = new Game();
mountApp(root, game);
showTitleScreen();

// iOS 사파리에서 :active 스타일이 동작하도록 빈 touchstart 리스너를 건다.
document.addEventListener('touchstart', () => {}, { passive: true });

if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
