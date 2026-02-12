import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { GamificationProvider } from './gamification/GamificationContext'
import App from './App'
import './index.css'

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <AuthProvider>
      <GamificationProvider>
        <App />
      </GamificationProvider>
    </AuthProvider>
  </React.StrictMode>
)
