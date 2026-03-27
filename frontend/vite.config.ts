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
      // Proxy payments endpoints to backend
      '/payments': 'http://localhost:3000',
      '/attempts': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/admin': {
        target: 'http://localhost:3000',
        bypass: (req) => (req.headers['sec-fetch-mode'] === 'navigate' || req.headers.accept?.includes('text/html')) ? '/index.html' : undefined,
      },
      '/stripe': 'http://localhost:3000',
      '/gamification': 'http://localhost:3000',
      '/username': 'http://localhost:3000',
      '/reports': 'http://localhost:3000',
      '/ratings': 'http://localhost:3000',
      '/certificates': 'http://localhost:3000',
      '/polls': 'http://localhost:3000',
      // These paths are both frontend routes AND backend API prefixes.
      // Browser navigations (Accept: text/html) get index.html; API calls proxy to backend.
      '/exams': {
        target: 'http://localhost:3000',
        bypass: (req) => (req.headers['sec-fetch-mode'] === 'navigate' || req.headers.accept?.includes('text/html')) ? '/index.html' : undefined,
      },
      '/skill-labs': {
        target: 'http://localhost:3000',
        bypass: (req) => (req.headers['sec-fetch-mode'] === 'navigate' || req.headers.accept?.includes('text/html')) ? '/index.html' : undefined,
      },
      '/pricing': {
        target: 'http://localhost:3000',
        bypass: (req) => (req.headers['sec-fetch-mode'] === 'navigate' || req.headers.accept?.includes('text/html')) ? '/index.html' : undefined,
      },
      '/analytics': {
        target: 'http://localhost:3000',
        bypass: (req) => (req.headers['sec-fetch-mode'] === 'navigate' || req.headers.accept?.includes('text/html')) ? '/index.html' : undefined,
      },
    }
  }
})
