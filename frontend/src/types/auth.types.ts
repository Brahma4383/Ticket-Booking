export type AuthMode = 'login' | 'signup'

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
