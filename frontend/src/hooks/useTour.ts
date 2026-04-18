import { useState, useCallback, useRef } from 'react'

export interface TourStep {
  target: string
  title: string
  body: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  waitForNav?: boolean
  isLast?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'setup-exam-btn',
    title: 'Setup an Exam',
    body: 'Click here to configure and start a practice exam.',
    placement: 'bottom',
  },
  {
    target: 'setup-exam-btn',
    title: "Let's Try It",
    body: 'Click any exam card to continue the tour.',
    placement: 'bottom',
    waitForNav: true,
  },
  {
    target: 'domain-dropdown',
    title: 'Choose Domains',
    body: 'Filter questions to specific domains you want to practise.',
    placement: 'bottom',
  },
  {
    target: 'mode-buttons',
    title: 'Pick a Mode',
    body: 'Casual for learning, Timed for exam simulation, or Weakest Link to target your weak areas.',
    placement: 'bottom',
  },
  {
    target: 'answer-reveal',
    title: 'Answer Reveal',
    body: 'Decide whether to see answers immediately after each question or only after finishing.',
    placement: 'top',
  },
  {
    target: 'start-exam-btn',
    title: "You're Ready!",
    body: "Hit Start Exam when you're set. Good luck!",
    placement: 'top',
    isLast: true,
  },
]

function isCompleted(): boolean {
  try { return localStorage.getItem('tour:completed') === 'true' } catch { return false }
}

export type TourApi = ReturnType<typeof useTour>

export function useTour() {
  const registry = useRef(new Map<string, HTMLElement>())
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [completed, setCompleted] = useState(isCompleted)

  const registerTarget = useCallback((name: string, el: HTMLElement | null) => {
    if (el) registry.current.set(name, el)
    else registry.current.delete(name)
  }, [])

  const getTarget = useCallback((name: string): HTMLElement | null => {
    return registry.current.get(name) ?? null
  }, [])

  const finish = useCallback(() => {
    try { localStorage.setItem('tour:completed', 'true') } catch {}
    setActive(false)
    setCompleted(true)
  }, [])

  const skip = useCallback(() => {
    try { localStorage.setItem('tour:completed', 'true') } catch {}
    setActive(false)
    setCompleted(true)
  }, [])

  const next = useCallback(() => {
    setStep((prev) => prev + 1)
  }, [])

  const goToStep = useCallback((n: number) => {
    setStep(n)
  }, [])

  const start = useCallback(() => {
    if (isCompleted()) return
    setStep(0)
    setActive(true)
  }, [])

  const currentStep = TOUR_STEPS[step] ?? null

  return {
    active,
    step,
    completed,
    steps: TOUR_STEPS,
    currentStep,
    start,
    next,
    skip,
    finish,
    goToStep,
    registerTarget,
    getTarget,
  }
}
