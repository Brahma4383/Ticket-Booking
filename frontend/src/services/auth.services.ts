import { apiGet, apiPost } from '@/services/api'
import type {
  AuthSession,
  AuthUser,
  PasswordResetRequested,
  ResetLinkInfo,
} from '@/types/auth.types'

/**
 * The accounts API, under `/api/auth/`.
 *
 * Booking requires an account; browsing does not. Search, seat maps and quotes
 * answer an anonymous request, and only `POST .../bookings/` refuses one — so
 * a traveller can shop the whole way to payment before signing in.
 */

/* ------------------------------------------------------------------
   Token storage
   ------------------------------------------------------------------ */

const TOKEN_KEY = 'suryabooker.token'

/**
 * `localStorage` rather than a cookie.
 *
 * The API authenticates with an `Authorization` header, which sidesteps
 * SameSite and CSRF entirely — a cookie shared across two dev origins would
 * need SameSite=None and therefore HTTPS. The trade is that a token here is
 * readable by any script on this origin, so it is worth remembering that an
 * XSS bug would be an account takeover.
 *
 * Every access is wrapped: a private window, blocked site data or a full quota
 * all make these throw rather than return nothing.
 */
export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string | null) {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY)
    else window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // A session that lives only until the tab closes is still a session.
  }
}

/* ------------------------------------------------------------------
   Endpoints
   ------------------------------------------------------------------ */

export interface RegisterInput {
  fullName: string
  email: string
  /** Ten digits. */
  phone: string
  password: string
}

/**
 * Create an account and sign in with it.
 *
 * Registering signs you in: someone who has just filled in a form to reach a
 * booking should not have to fill in a second one.
 *
 * Throws an `ApiError` with `code: 'account_exists'` and status 409 when the
 * email or mobile is already registered; `detail.field` says which.
 */
export function register(
  input: RegisterInput,
  signal?: AbortSignal,
): Promise<AuthSession> {
  return apiPost<AuthSession>('/auth/register/', input, signal)
}

/**
 * `error.code` for "nobody has registered with that email or mobile".
 *
 * Named here so the dialog branches on this rather than on a literal.
 */
export const ACCOUNT_NOT_FOUND = 'account_not_found'

/**
 * Sign in with an email address or a mobile number.
 *
 * Fails two ways, and the dialog treats them differently:
 *
 * - `code: 'account_not_found'`, status 404 — nothing is registered under
 *   that email or mobile. The sign-in box offers sign-up instead of a retry,
 *   since there is no password to get right.
 * - `code: 'invalid_credentials'`, status 401 — the account exists and the
 *   password is wrong, or the account is deactivated.
 *
 * Telling those apart is also how an account list gets enumerated; the
 * backend's `AccountNotFound` says what that costs.
 */
export function login(
  identifier: string,
  password: string,
  signal?: AbortSignal,
): Promise<AuthSession> {
  return apiPost<AuthSession>('/auth/login/', { identifier, password }, signal)
}

/**
 * The account a stored token belongs to.
 *
 * Called on load to turn a token back into a signed-in session. A 401 means
 * the token has expired or the password changed, and the right response is to
 * clear it rather than show an error.
 */
export function fetchMe(signal?: AbortSignal): Promise<AuthUser> {
  return apiGet<AuthUser>('/auth/me/', undefined, signal)
}

/* ------------------------------------------------------------------
   Forgotten passwords

   Three calls, one per screen: the request form in the sign-in dialog,
   the reset page checking its link as it opens, and that page's form.
   The link itself arrives by email and points at `/reset-password`.
   ------------------------------------------------------------------ */

/** `error.code` for a reset link that is expired, used or not ours. */
export const INVALID_RESET_LINK = 'invalid_reset_link'

/**
 * Email a reset link to the account behind an email or mobile number.
 *
 * Resolves the same way whether or not an account matched — the API will
 * not say which, so a reset form cannot be used to find out who is
 * registered. Throws an `ApiError` only for a malformed identifier (400) or
 * too many requests (429, `too_many_requests`).
 */
export function requestPasswordReset(
  identifier: string,
  signal?: AbortSignal,
): Promise<PasswordResetRequested> {
  return apiPost<PasswordResetRequested>(
    '/auth/password/forgot/',
    { identifier },
    signal,
  )
}

/**
 * Whether a reset link can still be used, so the page can say so before a
 * new password has been typed twice.
 *
 * Throws an `ApiError` with `code: 'invalid_reset_link'` when it cannot.
 */
export function checkResetLink(
  uid: string,
  token: string,
  signal?: AbortSignal,
): Promise<ResetLinkInfo> {
  return apiPost<ResetLinkInfo>('/auth/password/reset/check/', { uid, token }, signal)
}

/**
 * Set a new password from a reset link. Answers with a session: choosing a
 * new password signs you in, and signs every other device out.
 *
 * Throws an `ApiError`: `invalid_reset_link` when the link is spent, or
 * `invalid` with `detail.password` when the password is too weak or is the
 * current one.
 */
export function resetPassword(
  uid: string,
  token: string,
  password: string,
  signal?: AbortSignal,
): Promise<AuthSession> {
  return apiPost<AuthSession>(
    '/auth/password/reset/',
    { uid, token, password },
    signal,
  )
}
