import { Routes, Route } from 'react-router-dom'
import { ExamProvider } from './exam/ExamContext'
import { BasketProvider } from './basket/BasketContext'
import ExamApp from './exam/ExamApp'
import VerifyPage from './components/VerifyPage'
import LoginPage from './components/LoginPage'

export default function App() {
  return (
    <Routes>
      <Route path="/verify/:token" element={<VerifyPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={
        <ExamProvider>
          <BasketProvider>
            <ExamApp />
          </BasketProvider>
        </ExamProvider>
      } />
    </Routes>
  )
}
