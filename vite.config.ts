import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1800 },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts', testTimeout: 60000 },
});
