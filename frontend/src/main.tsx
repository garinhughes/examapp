import React from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './auth/AuthContext'
import { GamificationProvider } from './gamification/GamificationContext'
import { BasketProvider } from './basket/BasketContext'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <GamificationProvider>
            <BasketProvider>
              <App />
            </BasketProvider>
          </GamificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)
