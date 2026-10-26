import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { game:'index.html',maker:'map-maker.html',monster:'monster-maker.html',town:'town-maker.html' } } },
  test: {
    // 엔진은 브라우저 API 없이 실행되어야 한다 (INV-17)
    environment: 'node',
  },
});
