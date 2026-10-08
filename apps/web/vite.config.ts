/// <reference types="vitest/config" />
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// API_URL overrides the proxy target when port 3000 is taken: `API_URL=http://localhost:4000 pnpm dev`.
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

// The dev proxy means the frontend always calls relative `/api` and `/socket.io`.
// In production Caddy does the same job, so no CORS and no hard-coded URLs anywhere.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': apiUrl,
      '/socket.io': { target: apiUrl, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
