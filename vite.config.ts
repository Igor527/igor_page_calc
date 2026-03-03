import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// path и __dirname не нужны для alias в Vite

export default defineConfig(({ mode }) => {
  // Ключ Mistral в dev подставляется прокси, чтобы обойти CORS
  const env = loadEnv(mode, process.cwd(), '');
  const mistralKey = env.VITE_MISTRAL_API_KEY ?? '';

  return {
  // Сайт на GitHub Pages в подпапке: username.github.io/igor_page_calc/
  base: '/igor_page_calc/',
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
    proxy: {
      '/api/mistral': {
        target: 'https://api.mistral.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mistral/, '/v1/chat/completions'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (mistralKey) proxyReq.setHeader('Authorization', `Bearer ${mistralKey}`);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      onwarn(warning, warn) {
        const msg = warning.message || '';
        if (msg.includes('contains an annotation that Rollup cannot interpret')) return;
        warn(warning);
      },
    },
  },
  // Для SPA роутинга - все запросы должны возвращать index.html
  // Это настраивается на уровне сервера (Cloudflare Pages, Vercel и т.д.)
  };
});
