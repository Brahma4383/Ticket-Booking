import type { ReactNode } from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError } from '@/services/api'
import {
  fetchMe,
  login as loginRequest,
  readToken,
  register as registerRequest,
  resetPassword as resetPasswordRequest,
  writeToken,
} from '@/services/auth.services'
import type { RegisterInput } from '@/services/auth.services'
import type { AuthMode, AuthUser } from '@/types/auth.types'

/**
 * Who is signed in, and the one way to ask them to sign in.
 *
 * The provider owns the auth dialog rather than any page, because the thing
 * that most needs to open it is the payment step, several levels inside a
 * booking flow. `requestSignIn()` from anywhere beats threading a callback
 * down through five wizards.
 */

interface AuthContextValue {
  /** Null when nobody is signed in. */
  user: AuthUser | null
  signedIn: boolean
  /** True until the stored token has been checked on first load. */
  restoring: boolean
  /** Opens the dialog. Resolves once it closes, signed in or not. */
  requestSignIn: (mode?: AuthMode) => void
  signOut: () => void
  login: (identifier: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  /**
   * Set a new password from an emailed reset link, and sign in with it.
   * Throws the `ApiError` the reset endpoint answers with.
   */
  resetPassword: (uid: string, token: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = use(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.')
  }
  return value
}

/** The dialog's own state, read by whatever renders it. */
interface AuthDialogValue {
  mode: AuthMode | null
  /**
   * An email or mobile to start the sign-up form with, or empty.
   *
   * It lives here rather than in the dialog so that every path that closes
   * the dialog drops it - including a successful sign-in, which closes from
   * inside this provider. A later sign-up never opens holding an address
   * someone typed minutes ago.
   */
  prefill: string
  /** Switches tab; the second argument carries an identifier across. */
  setMode: (mode: AuthMode, prefill?: string) => void
  close: () => void
}

const AuthDialogContext = createContext<AuthDialogValue | null>(null)

export function useAuthDialog() {
  const value = use(AuthDialogContext)
  if (!value) {
    throw new Error('useAuthDialog must be used inside <AuthProvider>.')
  }
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [restoring, setRestoring] = useState(() => readToken() !== null)
  const [mode, setMode] = useState<AuthMode | null>(null)
  const [prefill, setPrefill] = useState('')

  // The one way the dialog opens, switches tab or closes, so the carried-over
  // identifier can never outlive the dialog that asked for it.
  const openDialog = useCallback((next: AuthMode | null, carry = '') => {
    setMode(next)
    setPrefill(carry)
  }, [])

  // Turn a stored token back into a session on load. A 401 means it expired
  // or the password changed, and the right response is to drop it quietly
  // rather than show an error to someone who has not asked for anything yet.
  useEffect(() => {
    if (readToken() === null) return

    const controller = new AbortController()

    fetchMe(controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.needsSignIn) writeToken(null)
      })
      .finally(() => setRestoring(false))

    return () => controller.abort()
  }, [])

  const login = useCallback(
    async (identifier: string, password: string) => {
      const session = await loginRequest(identifier, password)
      writeToken(session.token)
      setUser(session.user)
      openDialog(null)
    },
    [openDialog],
  )

  const register = useCallback(
    async (input: RegisterInput) => {
      const session = await registerRequest(input)
      writeToken(session.token)
      setUser(session.user)
      openDialog(null)
    },
    [openDialog],
  )

  // No dialog to close: the reset page is a page of its own. Whoever was
  // signed in on this browser before is replaced by the account that owns
  // the link.
  const resetPassword = useCallback(
    async (uid: string, token: string, password: string) => {
      const session = await resetPasswordRequest(uid, token, password)
      writeToken(session.token)
      setUser(session.user)
    },
    [],
  )

  const signOut = useCallback(() => {
    // Nothing to tell the server: the token is signed rather than stored, so
    // signing out is dropping it.
    writeToken(null)
    setUser(null)
  }, [])

  const auth = useMemo<AuthContextValue>(
    () => ({
      user,
      signedIn: user !== null,
      restoring,
      requestSignIn: (next: AuthMode = 'login') => openDialog(next),
      signOut,
      login,
      register,
      resetPassword,
    }),
    [user, restoring, openDialog, signOut, login, register, resetPassword],
  )

  const dialog = useMemo<AuthDialogValue>(
    () => ({
      mode,
      prefill,
      setMode: (next: AuthMode, carry = '') => openDialog(next, carry),
      close: () => openDialog(null),
    }),
    [mode, prefill, openDialog],
  )

  return (
    <AuthContext value={auth}>
      <AuthDialogContext value={dialog}>{children}</AuthDialogContext>
    </AuthContext>
  )
}
