import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// path и __dirname не нужны для alias в Vite

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@lib': '/src/lib',
      '@types': '/src/types',
    },
  },
  server: {
    port: 5173,
    host: 'localhost',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // Для SPA роутинга - все запросы должны возвращать index.html
  // Это настраивается на уровне сервера (Cloudflare Pages, Vercel и т.д.)
});
