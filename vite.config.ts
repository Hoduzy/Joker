import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages 하위 경로(/Joker/)에서도 그대로 동작하게 한다.
  base: './',
});
