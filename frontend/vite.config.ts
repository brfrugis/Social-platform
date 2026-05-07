import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Fail fast if 5173 is taken (e.g. uvicorn started on the wrong port).
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Default proxy timeouts are too short for Studio + cloud LLMs (many sequential variants).
        timeout: 900_000,
        proxyTimeout: 900_000,
      },
    },
  },
})
