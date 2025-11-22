import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:3337';
  const media = env.VITE_MEDIA_PROXY_URL || 'http://localhost:3335';
  const graphql = env.VITE_BACKEND_URL || 'http://localhost:3337';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3336,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
        '/media': {
          target: media,
          changeOrigin: true,
        },
        '/proxy': {
          target: media,
          changeOrigin: true,
        },
        '/graphql': {
          target: graphql,
          changeOrigin: true,
        },
      },
    },
  };
});
