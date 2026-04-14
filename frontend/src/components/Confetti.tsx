import { useEffect, useRef, useState } from 'react'
import { BadgeIcon } from '../gamification/BadgeIcon'

/** Lightweight CSS confetti - no dependencies */
export function Confetti({ duration = 3000, onDone }: { duration?: number; onDone?: () => void }) {
  const [particles] = useState(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      size: 6 + Math.random() * 6,
      color: ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'][i % 7],
      drift: (Math.random() - 0.5) * 120,
      spin: Math.random() * 720 - 360,
    }))
  )
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(() => onDone?.(), duration)
    return () => clearTimeout(timerRef.current)
  }, [duration, onDone])

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute block rounded-sm"
          style={{
            left: `${p.x}%`,
            top: '-12px',
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            animation: `confetti-fall ${duration / 1000}s ease-in ${p.delay}s forwards`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(var(--spin)); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

/** Reward modal shown on pass / level-up */
export function RewardModal({
  title,
  subtitle,
  xpGained,
  badges,
  onClose,
}: {
  title: string
  subtitle?: string
  xpGained: number
  badges: { id: string; icon: string; name: string }[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 text-center animate-[reward-pop_0.4s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
            <circle cx="32" cy="36" r="20" fill="#f59e0b" />
            <circle cx="32" cy="36" r="15" fill="#fbbf24" />
            <text x="32" y="42" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#92400e">1</text>
            <rect x="28" y="4" width="8" height="18" rx="3" fill="#6366f1" />
            <polygon points="24,4 40,4 44,14 20,14" fill="#818cf8" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mb-3">{subtitle}</p>}

        {xpGained > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-3">
            +{xpGained} XP
          </div>
        )}

        {badges.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Badges</p>
            {badges.map((b) => (
              <div key={b.name} className="flex items-center gap-2 justify-center">
                <span className="animate-[badge-bounce_0.6s_ease-out]"><BadgeIcon id={b.id} size={24} /></span>
                <span className="font-medium">{b.name}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
        >
          Continue
        </button>
      </div>

      <style>{`
        @keyframes reward-pop {
          0%   { transform: scale(0.7); opacity: 0; }
          50%  { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes badge-bounce {
          0%   { transform: scale(0); }
          50%  { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
