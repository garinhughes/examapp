/**
 * useLabSession — extracts all shared lifecycle boilerplate from lab runners:
 *   timer, pause/resume, submit scaffolding, gamification, attempt recording.
 *
 * Each runner only needs to implement its unique interaction surface and validation,
 * then call session.finalize(correct, selectedAnswer) when done.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { LabSummary } from '../types'
import { useLabProgress } from './useLabProgress'
import { useLabComplete } from './shared'

type LabMeta = Pick<LabSummary, 'id' | 'type' | 'difficulty' | 's3VersionId'> & { timeLimit: number }

export function useLabSession<TProgress extends { timeLeft: number }>(options: {
  lab: LabMeta
  timed: boolean
}): {
  savedProgress: TProgress | null
  saveProgress: (state: TProgress) => void
  timeLeft: number
  labPaused: boolean
  setLabPaused: (v: boolean) => void
  submitted: boolean
  resumeNotice: boolean
  showConfirmModal: boolean
  setShowConfirmModal: (v: boolean) => void
  /** Call after computing correct/result. Handles submitted state, clearProgress, timer, gamification, and attempt API. */
  finalize: (correct: boolean, selectedAnswer?: string) => Promise<void>
  /** Save current progress snapshot and navigate back to skill-labs. */
  handlePauseAndExit: (snapshot: TProgress) => void
  /** Discard saved progress and navigate back to skill-labs. */
  handleCancelLab: () => void
} {
  const { authFetch, user, setRoute } = useExam()
  const { lab, timed } = options
  const completeWithGamification = useLabComplete(lab)
  const { savedProgress, saveProgress, clearProgress } = useLabProgress<TProgress>(lab.id, timed, lab.s3VersionId)

  const [timeLeft, setTimeLeft] = useState<number>(savedProgress ? savedProgress.timeLeft : lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(savedProgress !== null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const submittedRef = useRef(false)

  // Auto-dismiss resume notice after 3 seconds
  useEffect(() => {
    if (!resumeNotice) return
    const t = setTimeout(() => setResumeNotice(false), 3000)
    return () => clearTimeout(t)
  }, [resumeNotice])

  // Timer — starts/stops based on submitted/timed/labPaused
  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  const finalize = useCallback(async (correct: boolean, selectedAnswer = '') => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    clearProgress()
    if (timerRef.current) clearInterval(timerRef.current)
    completeWithGamification(correct)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer, correct, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [clearProgress, completeWithGamification, authFetch, user, lab.id])

  const handlePauseAndExit = useCallback((snapshot: TProgress) => {
    saveProgress(snapshot)
    setRoute('skill-labs')
  }, [saveProgress, setRoute])

  const handleCancelLab = useCallback(() => {
    clearProgress()
    setRoute('skill-labs')
  }, [clearProgress, setRoute])

  return {
    savedProgress,
    saveProgress,
    timeLeft,
    labPaused,
    setLabPaused,
    submitted,
    resumeNotice,
    showConfirmModal,
    setShowConfirmModal,
    finalize,
    handlePauseAndExit,
    handleCancelLab,
  }
}
