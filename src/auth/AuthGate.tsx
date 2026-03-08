import { useEffect, useMemo, useState } from 'react'

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

const persistAuthAndRedirect = (authMethod: AuthMethod) => {
  window.localStorage.setItem(AUTH_STORAGE_KEY, authMethod)
  const postLoginPath = getPostLoginPath()
  if (window.location.pathname !== postLoginPath) {
    window.history.replaceState(null, '', postLoginPath)
  }
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(window.localStorage.getItem(AUTH_STORAGE_KEY)))
  const [googleError, setGoogleError] = useState<string | null>(null)
  const postLoginPath = useMemo(() => getPostLoginPath(), [])

  useEffect(() => {
    if (isAuthenticated && window.location.pathname !== postLoginPath) {
      window.history.replaceState(null, '', postLoginPath)
      return
    }

    if (!isAuthenticated) {
      trackAuthEvent('auth_screen_viewed')
    }
  }, [isAuthenticated, postLoginPath])

  const completeLogin = (authMethod: AuthMethod) => {
    persistAuthAndRedirect(authMethod)
    setIsAuthenticated(true)
  }

  const handleGoogleLogin = async () => {
    setGoogleError(null)
    trackAuthEvent('google_click')

    try {
      if (!navigator.onLine) {
        throw new Error('No internet connection. Please reconnect and try again.')
      }

      completeLogin('google')
      trackAuthEvent('google_success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed.'
      setGoogleError(message)
      trackAuthEvent('google_error', { message })
    }
  }

  const handleEmailFallback = () => {
    setGoogleError(null)
    trackAuthEvent('fallback_email_click')
    completeLogin('email')
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
          <button type="button" className="auth-btn auth-btn-secondary" onClick={handleEmailFallback}>
            Continue with email
          </button>
        </div>

        {googleError ? (
          <p className="auth-entry-error" role="alert">
            {googleError}
          </p>
        ) : null}
      </section>
    </main>
  )
}
