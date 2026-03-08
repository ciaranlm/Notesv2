import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  authConfigError,
  clearAuthHash,
  createGoogleAuthUrl,
  getAuthenticatedUser,
  getStoredSession,
  persistSession,
  readSessionFromHash,
  sendMagicLink,
} from './supabaseAuth'

type AuthMethod = 'google' | 'email'

type AuthGateProps = {
  children: JSX.Element
}

type AuthEventName =
  | 'auth_screen_viewed'
  | 'google_click'
  | 'google_success'
  | 'google_error'
  | 'fallback_email_click'

const AUTH_STORAGE_KEY = 'notesv2_auth_method'
const DEFAULT_POST_LOGIN_ROUTE = '/app'
const OAUTH_PENDING_KEY = 'notesv2_google_pending'

const trackAuthEvent = (eventName: AuthEventName, metadata?: Record<string, string>) => {
  const payload = {
    event: eventName,
    ...metadata,
  }

  const dataLayerHost = window as Window & { dataLayer?: unknown[] }
  if (Array.isArray(dataLayerHost.dataLayer)) {
    dataLayerHost.dataLayer.push(payload)
  }

  window.dispatchEvent(new CustomEvent('notesv2_analytics', { detail: payload }))
}

const getPostLoginPath = () => {
  const redirectParam = new URLSearchParams(window.location.search).get('redirect')
  if (redirectParam && redirectParam.startsWith('/')) {
    return redirectParam
  }
  return DEFAULT_POST_LOGIN_ROUTE
}

const getAbsoluteRedirectUrl = (postLoginPath: string) => `${window.location.origin}${postLoginPath}`

const persistAuthAndRedirect = (authMethod: AuthMethod, postLoginPath: string) => {
  window.localStorage.setItem(AUTH_STORAGE_KEY, authMethod)
  if (window.location.pathname !== postLoginPath) {
    window.history.replaceState(null, '', postLoginPath)
  }
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState<string | null>(null)
  const [isEmailMode, setIsEmailMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const postLoginPath = useMemo(() => getPostLoginPath(), [])

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const hashSession = readSessionFromHash()
        if (hashSession) {
          persistSession(hashSession)
          clearAuthHash()
        }

        const session = hashSession ?? getStoredSession()
        if (!session) {
          setIsAuthenticated(false)
          return
        }

        const user = await getAuthenticatedUser(session.access_token)
        const provider = user.app_metadata?.provider === 'google' ? 'google' : 'email'
        persistAuthAndRedirect(provider, postLoginPath)
        setIsAuthenticated(true)

        if (provider === 'google' && window.localStorage.getItem(OAUTH_PENDING_KEY) === 'true') {
          trackAuthEvent('google_success')
          window.localStorage.removeItem(OAUTH_PENDING_KEY)
        }
      } catch {
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    void bootstrapAuth()
  }, [postLoginPath])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      trackAuthEvent('auth_screen_viewed')
    }
  }, [isAuthenticated, isLoading])

  const handleGoogleLogin = () => {
    setGoogleError(null)
    trackAuthEvent('google_click')

    try {
      const googleAuthUrl = createGoogleAuthUrl(getAbsoluteRedirectUrl(postLoginPath))
      window.localStorage.setItem(OAUTH_PENDING_KEY, 'true')
      window.location.assign(googleAuthUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed.'
      setGoogleError(message)
      trackAuthEvent('google_error', { message })
    }
  }

  const handleEmailFallbackClick = () => {
    trackAuthEvent('fallback_email_click')
    setGoogleError(null)
    setEmailStatus(null)
    setIsEmailMode(true)
  }

  const handleMagicLink = async (event: FormEvent) => {
    event.preventDefault()
    setEmailStatus(null)

    try {
      await sendMagicLink(email, getAbsoluteRedirectUrl(postLoginPath))
      setEmailStatus('Magic link sent. Check your inbox to continue.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send magic link.'
      setEmailStatus(message)
    }
  }

  if (isLoading) {
    return <main className="auth-entry-screen" aria-label="Authentication screen" />
  }

  if (isAuthenticated) {
    return children
  }

  return (
    <main className="auth-entry-screen" aria-label="Authentication screen">
      <section className="auth-entry-card">
        <p className="auth-entry-eyebrow">Welcome to Notes</p>
        <h1>Sign in to sync your notes</h1>
        <p className="auth-entry-subtitle">Use Google for the fastest sign in, or continue with email.</p>

        <div className="auth-entry-actions">
          <button type="button" className="auth-btn auth-btn-primary" onClick={handleGoogleLogin}>
            Continue with Google
          </button>
          <button type="button" className="auth-btn auth-btn-secondary" onClick={handleEmailFallbackClick}>
            Continue with email
          </button>
        </div>

        {isEmailMode ? (
          <form className="auth-email-form" onSubmit={handleMagicLink}>
            <label htmlFor="auth-email" className="auth-email-label">
              Email
            </label>
            <input
              id="auth-email"
              className="auth-email-input"
              type="email"
              value={email}
              onChange={(inputEvent) => setEmail(inputEvent.target.value)}
              placeholder="you@example.com"
              required
            />
            <button type="submit" className="auth-btn auth-btn-secondary">
              Send magic link
            </button>
          </form>
        ) : null}

        {authConfigError ? (
          <p className="auth-entry-error" role="alert">
            {authConfigError}
          </p>
        ) : null}

        {googleError ? (
          <p className="auth-entry-error" role="alert">
            {googleError}
          </p>
        ) : null}

        {emailStatus ? <p className="auth-entry-status">{emailStatus}</p> : null}
      </section>
    </main>
  )
}
