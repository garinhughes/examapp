import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // proxy API calls to backend running on port 3000
      '/exams': 'http://localhost:3000',
      '/attempts': 'http://localhost:3000',
      '/analytics': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/pricing': 'http://localhost:3000',
      '/stripe': 'http://localhost:3000',
      '/gamification': 'http://localhost:3000',
      '/username': 'http://localhost:3000',
    }
  }
})
