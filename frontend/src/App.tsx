import { ExamProvider } from './exam/ExamContext'
import { BasketProvider } from './basket/BasketContext'
import ExamApp from './exam/ExamApp'

export default function App() {
  return (
    <ExamProvider>
      <BasketProvider>
        <ExamApp />
      </BasketProvider>
    </ExamProvider>
  )
}
