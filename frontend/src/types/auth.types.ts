/**
 * What the sign-in dialog is showing. `forgot` is the "email me a reset
 * link" form, reached from the log-in tab rather than being a tab itself.
 */
export type AuthMode = 'login' | 'signup' | 'forgot'

/** The signed-in account, as `/api/auth/me/` returns it. */
export interface AuthUser {
  id: string
  fullName: string
  email: string
  /** Ten digits, or empty if the account has none. */
  phone: string
  emailVerified: boolean
  phoneVerified: boolean
  /** ISO 8601, or null on an account with no recorded creation time. */
  createdAt: string | null
}

/** What a successful sign-in or sign-up hands back. */
export interface AuthSession {
  token: string
  /** Seconds until the token stops being accepted. */
  expiresIn: number
  user: AuthUser
}

/** What asking for a reset link answers — the same whether or not an account matched. */
export interface PasswordResetRequested {
  sent: true
  /** How long the emailed link works. */
  expiresInMinutes: number
}

/** A reset link that still works, as the reset page checks it on opening. */
export interface ResetLinkInfo {
  valid: true
  /** Masked, e.g. `d•••o@gmail.com` — enough to recognise the account. */
  email: string
  firstName: string
}
