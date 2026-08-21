import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': env.DODAM_API_PROXY_TARGET ?? 'http://localhost:3000'
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  };
});
