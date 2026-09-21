import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/search": "http://127.0.0.1:5000",
      "/add": "http://127.0.0.1:5000",
    },
  },
})
