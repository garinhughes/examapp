export type Exam = {
  code: string
  title?: string
  provider?: string
  version?: string
  logo?: string
  logoHref?: string
  passMark?: number
  defaultQuestions?: number
  defaultQuestionCount?: number
  defaultDuration?: number
  questions?: unknown[]
  level?: string
  predecessorCode?: string
}

export type QuestionType = 'single-choice' | 'multiple-choice' | 'matching' | 'ordering'

export type Choice = {
  id: string
  text: string
  isCorrect: boolean
  explanation?: string
  sequence?: number
}

export type Slot = {
  id: string
  label: string
  correctChoiceId: string
}

export type Question = {
  id: string
  type?: QuestionType
  question: string
  choices: Choice[]
  selectCount?: number
  slots?: Slot[]
  format?: string
  domain?: string
  skills?: string[]
  tip?: string
  explanation?: string
  image?: string
  docs?: string
  difficulty?: number
  services?: string[]
}

export type ExamMode = 'casual' | 'timed' | 'weakest-link' | 'weakest-link-timed'
export type RevealMode = 'immediately' | 'on-completion'
export type AppRoute = 'home' | 'practice' | 'analytics' | 'account' | 'admin' | 'metrics' | 'pricing' | 'basket' | 'diagrams' | 'skill-labs' | 'feedback' | 'privacy' | 'terms' | 'refund' | `skill-lab:${string}` | `skill-lab-detail:${string}`
