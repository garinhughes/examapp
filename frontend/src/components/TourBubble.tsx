import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTourContext } from './TourProvider'

interface BubblePos {
  top: number
  left: number
}

interface HighlightPos {
  top: number
  left: number
  width: number
  height: number
}

export function TourBubble() {
  const tour = useTourContext()
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null)
  const [highlightPos, setHighlightPos] = useState<HighlightPos | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!tour.active || !tour.currentStep) {
      setBubblePos(null)
      setHighlightPos(null)
      setVisible(false)
      return
    }

    const step = tour.currentStep

    const update = () => {
      const el = tour.getTarget(step.target)
      const bubble = bubbleRef.current
      if (!el || !bubble) return

      const rect = el.getBoundingClientRect()
      const bw = bubble.offsetWidth || 280
      const bh = bubble.offsetHeight || 140

      setHighlightPos({
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      })

      // Off-screen target → center the bubble
      if (rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight) {
        setBubblePos({
          top: window.innerHeight / 2 - bh / 2,
          left: window.innerWidth / 2 - bw / 2,
        })
        setVisible(true)
        return
      }

      let top = 0
      let left = 0
      const { placement } = step

      if (placement === 'bottom') {
        top = rect.bottom + 12
        if (top + bh > window.innerHeight - 12) top = rect.top - bh - 12
        left = rect.left + rect.width / 2 - bw / 2
      } else if (placement === 'top') {
        top = rect.top - bh - 12
        if (top < 12) top = rect.bottom + 12
        left = rect.left + rect.width / 2 - bw / 2
      } else if (placement === 'right') {
        left = rect.right + 12
        top = rect.top + rect.height / 2 - bh / 2
      } else {
        left = rect.left - bw - 12
        top = rect.top + rect.height / 2 - bh / 2
      }

      left = Math.max(12, Math.min(left, window.innerWidth - bw - 12))
      top = Math.max(12, Math.min(top, window.innerHeight - bh - 12))

      setBubblePos({ top, left })
      setVisible(true)
    }

    setVisible(false)
    const rafId = requestAnimationFrame(update)

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [tour.active, tour.step])

  if (!tour.active || !tour.currentStep) return null

  const step = tour.currentStep
  const stepNum = tour.step + 1
  const totalSteps = tour.steps.length

  return createPortal(
    <>
      {/* Highlight ring around target */}
      {highlightPos && (
        <div
          style={{
            position: 'fixed',
            top: highlightPos.top,
            left: highlightPos.left,
            width: highlightPos.width,
            height: highlightPos.height,
            pointerEvents: 'none',
            zIndex: 9998,
            borderRadius: 8,
          }}
          className="ring-2 ring-orange-500 ring-offset-2 animate-pulse"
        />
      )}

      {/* Tooltip bubble */}
      <div
        ref={bubbleRef}
        style={{
          position: 'fixed',
          top: bubblePos?.top ?? 0,
          left: bubblePos?.left ?? 0,
          zIndex: 9999,
          width: 280,
          visibility: visible ? 'visible' : 'hidden',
        }}
        className="rounded-xl shadow-2xl p-4 bg-orange-500 text-white"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="font-semibold text-sm leading-snug">{step.title}</span>
          <button
            onClick={tour.skip}
            className="opacity-70 hover:opacity-100 transition flex-shrink-0 mt-0.5"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm opacity-90 leading-snug mb-3">{step.body}</p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs opacity-60">{stepNum} / {totalSteps}</span>

          {step.waitForNav ? (
            <button
              onClick={tour.skip}
              className="text-xs opacity-70 hover:opacity-100 transition"
            >
              Skip tour
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={tour.skip}
                className="text-xs opacity-70 hover:opacity-100 transition"
              >
                Skip
              </button>
              <button
                onClick={step.isLast ? tour.finish : tour.next}
                className="text-xs bg-white/25 hover:bg-white/40 px-3 py-1 rounded-md font-semibold transition"
              >
                {step.isLast ? 'Done' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
