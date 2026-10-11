import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` produces relative asset URLs so the build works from any
// sub-path (GitHub Pages project sites) as well as from a domain root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // KaTeX + React make up most of the single bundle; it is ~180 kB gzipped.
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
