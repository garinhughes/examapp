// Sentry helpers — keep app code free of direct @sentry/react imports.
//
// Free-tier policy:
//   - tracesSampleRate: 0 (no perf traces)
//   - No Replay / Profiling
//   - Use captureException + captureMessage + breadcrumbs + scope only
//   - beforeSend in main.tsx drops ResizeObserver loops, AbortError,
//     silent token-refresh 401s. Use captureWarning for soft signals.
import * as Sentry from '@sentry/react'

type Level = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

interface CaptureContext {
  tags?: Record<string, string | number | boolean | undefined>
  extra?: Record<string, unknown>
  user?: { id?: string; email?: string }
  level?: Level
  fingerprint?: string[]
}

const ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env?.VITE_SENTRY_DSN

function applyScope(scope: Sentry.Scope, ctx: CaptureContext | undefined) {
  if (!ctx) return
  if (ctx.tags) {
    for (const [k, v] of Object.entries(ctx.tags)) {
      if (v !== undefined) scope.setTag(k, String(v))
    }
  }
  if (ctx.extra) {
    for (const [k, v] of Object.entries(ctx.extra)) scope.setExtra(k, v)
  }
  if (ctx.user) scope.setUser(ctx.user)
  if (ctx.level) scope.setLevel(ctx.level)
  if (ctx.fingerprint) scope.setFingerprint(ctx.fingerprint)
}

export function captureError(err: unknown, ctx?: CaptureContext): void {
  if (!ENABLED) return
  Sentry.withScope((scope) => {
    applyScope(scope, ctx)
    Sentry.captureException(err)
  })
}

export function captureWarning(message: string, ctx?: CaptureContext): void {
  if (!ENABLED) return
  Sentry.withScope((scope) => {
    applyScope(scope, { ...ctx, level: ctx?.level ?? 'warning' })
    Sentry.captureMessage(message, 'warning')
  })
}

export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Level = 'info',
): void {
  if (!ENABLED) return
  Sentry.addBreadcrumb({ category, message, data, level })
}

export function setSentryUser(id: string | null): void {
  if (!ENABLED) return
  Sentry.setUser(id ? { id } : null)
}
