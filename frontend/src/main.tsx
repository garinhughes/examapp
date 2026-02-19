import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { GamificationProvider } from './gamification/GamificationContext'
import { ThemeProvider } from './components/theme-provider'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <GamificationProvider>
            <App />
          </GamificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
