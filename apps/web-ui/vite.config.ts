import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for the WCL AI web UI.
 *
 * - Dev: `pnpm --filter @wcl/web-ui dev` starts a dev server (default 5173)
 *   that proxies every `/api/*` request to the Node backend on 8787, so the
 *   React app talks to the exact same SSE/session contract in development.
 * - Build: `pnpm --filter @wcl/web-ui build` emits a static SPA into `dist/`
 *   (index.html + hashed assets). The Node backend serves `dist/` directly.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});