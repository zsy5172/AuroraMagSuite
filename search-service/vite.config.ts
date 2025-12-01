import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:3337';

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 3336,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/details': { target: backend, changeOrigin: true },
        '/graphql': { target: backend, changeOrigin: true },
      },
    },
  };
});
