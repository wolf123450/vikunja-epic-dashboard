import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => ({
  root: 'web',
  plugins: [vue()],
  // `npm run dev:web:mock` runs `vite --mode mock`: the web app serves fake data, no server needed.
  define: mode === 'mock' ? { 'import.meta.env.VITE_MOCK': JSON.stringify('1') } : {},
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
}));
