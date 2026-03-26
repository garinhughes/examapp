import { Routes, Route } from 'react-router-dom'
import { ExamProvider } from './exam/ExamContext'
import { BasketProvider } from './basket/BasketContext'
import ExamApp from './exam/ExamApp'
import VerifyPage from './components/VerifyPage'
import LoginPage from './components/LoginPage'
import { usePageTracking } from './hooks/usePageTracking'

function ExamAppWrapped() {
  return (
    <ExamProvider>
      <BasketProvider>
        <ExamApp />
      </BasketProvider>
    </ExamProvider>
  )
}

export default function App() {
  usePageTracking()

  return (
    <Routes>
      <Route path="/verify/:token" element={<VerifyPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ExamAppWrapped />} />
      <Route path="/exams" element={<ExamAppWrapped />} />
      <Route path="/skill-labs" element={<ExamAppWrapped />} />
      <Route path="/analytics" element={<ExamAppWrapped />} />
      <Route path="/pricing" element={<ExamAppWrapped />} />
      <Route path="/account" element={<ExamAppWrapped />} />
      <Route path="/privacy" element={<ExamAppWrapped />} />
      <Route path="/terms" element={<ExamAppWrapped />} />
      <Route path="/refund" element={<ExamAppWrapped />} />
      <Route path="*" element={<ExamAppWrapped />} />
    </Routes>
  )
}
