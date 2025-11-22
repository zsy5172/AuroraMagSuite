import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3336,
    proxy: {
      '/api': 'http://localhost:3335',
      '/proxy': 'http://localhost:3335',
      '/graphql': 'http://localhost:3333'
    }
  }
});
