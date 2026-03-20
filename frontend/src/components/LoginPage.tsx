import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button } from './ui/button'

type EmailView = 'signin' | 'register' | 'confirm' | 'forgot' | 'reset'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { loginWithProvider, loginWithEmail, registerWithEmail, confirmEmail, resendConfirmation, forgotPassword, resetPassword } = useAuth()

  const [view, setView] = useState<EmailView>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await loginWithEmail(email, password)
      navigate('/')
    } catch (err: any) {
      if (err.code === 'UserNotConfirmed') {
        setInfo('Please verify your email first. Enter the code sent to you.')
        setView('confirm')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await registerWithEmail(email, password)
      setInfo('Check your email for a verification code.')
      setView('confirm')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await confirmEmail(email, code)
      setInfo('Email confirmed! You can now sign in.')
      setView('signin')
      setCode('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError(null)
    try {
      await resendConfirmation(email)
      setInfo('Verification code resent.')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await forgotPassword(email)
      setInfo('If an account exists, a reset code has been sent to your email.')
      setView('reset')
    } catch {
      setInfo('If an account exists, a reset code has been sent to your email.')
      setView('reset')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await resetPassword(email, code, newPassword)
      setInfo('Password reset successful. You can now sign in.')
      setView('signin')
      setCode('')
      setNewPassword('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {view === 'register' ? 'Create account' : view === 'confirm' ? 'Verify email' : view === 'forgot' ? 'Forgot password' : view === 'reset' ? 'Reset password' : 'Sign in'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {view === 'register' ? 'Already have an account?' : view === 'signin' ? "Don't have an account?"  : null}
            {(view === 'signin' || view === 'register') && (
              <button
                className="ml-1 underline underline-offset-4 hover:text-foreground"
                onClick={() => { setView(view === 'signin' ? 'register' : 'signin'); setError(null); setInfo(null) }}
              >
                {view === 'signin' ? 'Register' : 'Sign in'}
              </button>
            )}
          </p>
        </div>

        {info && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
            {info}
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Social sign-in — only on signin/register views */}
        {(view === 'signin' || view === 'register') && (
          <div className="space-y-3">
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-background px-2">Login with</span>
              </div>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="icon" onClick={() => loginWithProvider('Google')} title="Continue with Google">
                <GoogleIcon />
              </Button>
              <Button variant="outline" size="icon" onClick={() => loginWithProvider('Facebook')} title="Continue with Facebook">
                <FacebookIcon />
              </Button>
              <Button variant="outline" size="icon" onClick={() => loginWithProvider('Apple')} title="Continue with Apple">
                <AppleIcon />
              </Button>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-background px-2">or continue with email</span>
              </div>
            </div>
          </div>
        )}

        {/* Email sign-in form */}
        {view === 'signin' && (
          <form onSubmit={handleEmailSignIn} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="text-right">
              <button type="button" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => { setView('forgot'); setError(null); setInfo(null) }}>
                Forgot password?
              </button>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        )}

        {/* Register form */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        )}

        {/* Email confirmation form */}
        {view === 'confirm' && (
          <form onSubmit={handleConfirm} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text"
              required
              placeholder="Verification code"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Confirming…' : 'Confirm email'}
            </Button>
            <button type="button" className="w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={handleResend}>
              Resend code
            </button>
          </form>
        )}

        {/* Forgot password form */}
        {view === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </Button>
            <button type="button" className="w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => { setView('signin'); setError(null); setInfo(null) }}>
              Back to sign in
            </button>
          </form>
        )}

        {/* Reset password form */}
        {view === 'reset' && (
          <form onSubmit={handleReset} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text"
              required
              placeholder="Reset code"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              placeholder="New password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        )}

        <div className="text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Home
          </button>
        </div>
      </div>
    </div>
  )
}
