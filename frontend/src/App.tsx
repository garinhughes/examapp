import { ExamProvider } from './exam/ExamContext'
import ExamApp from './exam/ExamApp'

export default function App() {
  return (
    <ExamProvider>
      <ExamApp />
    </ExamProvider>
  )
}
