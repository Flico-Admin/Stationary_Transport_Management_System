import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Any request starting with /api is sent to the backend, so the browser never has CORS problems
    proxy: { '/api': 'http://localhost:4000' },
  },
});
