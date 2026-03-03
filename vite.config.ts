import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// path и __dirname не нужны для alias в Vite

/** В dev: прокси для загрузки CSV по URL (обход CORS). */
function weatherCsvProxyPlugin() {
  return {
    name: 'weather-csv-proxy',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/weather-csv?')) {
          next();
          return;
        }
        const u = new URL(req.url, 'http://localhost');
        const target = u.searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          res.end('Missing url');
          return;
        }
        try {
          const resp = await fetch(target, { headers: { Accept: 'text/csv,text/plain,*/*' } });
          res.statusCode = resp.status;
          res.setHeader('Content-Type', resp.headers.get('Content-Type') || 'text/plain; charset=utf-8');
          const text = await resp.text();
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Proxy error: ' + (e instanceof Error ? e.message : String(e)));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Ключ Mistral в dev подставляется прокси, чтобы обойти CORS
  const env = loadEnv(mode, process.cwd(), '');
  const mistralKey = env.VITE_MISTRAL_API_KEY ?? '';

  return {
  // Сайт публикуется на https://urbanplanner.page (custom domain)
  base: '/',
  plugins: [react(), weatherCsvProxyPlugin()],
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
