const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export type SupabaseSession = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_at: number
}

export const authConfigError =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? null
    : 'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'

const SESSION_STORAGE_KEY = 'notesv2_supabase_session'

const getAuthHeaders = () => ({
  apikey: SUPABASE_ANON_KEY ?? '',
  'Content-Type': 'application/json',
})

export const getStoredSession = (): SupabaseSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SupabaseSession
    if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) return null
    if (Date.now() / 1000 >= parsed.expires_at) return null
    return parsed
  } catch {
    return null
  }
}

export const persistSession = (session: SupabaseSession) => {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export const createGoogleAuthUrl = (redirectTo: string) => {
  if (authConfigError) throw new Error(authConfigError)
  const endpoint = new URL('/auth/v1/authorize', SUPABASE_URL)
  endpoint.searchParams.set('provider', 'google')
  endpoint.searchParams.set('redirect_to', redirectTo)
  return endpoint.toString()
}

export const sendMagicLink = async (email: string, redirectTo: string) => {
  if (authConfigError) throw new Error(authConfigError)
  const response = await fetch(new URL('/auth/v1/otp', SUPABASE_URL), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: redirectTo,
    }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error_description?: string; msg?: string }
    throw new Error(body.error_description ?? body.msg ?? 'Unable to send email link.')
  }
}

const cleanHash = (hash: string) => (hash.startsWith('#') ? hash.slice(1) : hash)

export const readSessionFromHash = (): SupabaseSession | null => {
  const params = new URLSearchParams(cleanHash(window.location.hash))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const expiresInRaw = params.get('expires_in')
  const tokenType = params.get('token_type')

  if (!accessToken || !refreshToken || !expiresInRaw || !tokenType) return null

  const expiresIn = Number(expiresInRaw)
  if (!Number.isFinite(expiresIn)) return null

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: tokenType,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  }
}

export const clearAuthHash = () => {
  if (!window.location.hash) return
  const url = `${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', url)
}

export const getAuthenticatedUser = async (accessToken: string) => {
  if (authConfigError) throw new Error(authConfigError)
  const response = await fetch(new URL('/auth/v1/user', SUPABASE_URL), {
    headers: {
      ...getAuthHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Session verification failed.')
  }

  return response.json() as Promise<{ app_metadata?: { provider?: string } }>
}
