import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  envDir: false,
  base: './',
  server: {
    host: mode === 'test' ? '127.0.0.1' : 'localhost',
    port: 5173, strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${mode === 'test' ? 3002 : 3001}`, '/socket.io': { target: `http://127.0.0.1:${mode === 'test' ? 3002 : 3001}`, ws: true } },
  },
}));
