import { readToken } from '@/services/auth.services'
import type { ApiErrorBody, ApiErrorEnvelope } from '@/types/api.types'

/**
 * The one place the front end talks to the Django API.
 *
 * Every `*.services.ts` module goes through `apiGet` and `apiPost`, so the
 * base URL, the JSON handling and the error envelope are decided once.
 *
 * The API lives on its own origin in development (Vite on 5173, Django on
 * 8000), which is why `CORS_ALLOWED_ORIGINS` in the backend settings lists
 * this one. Behind a single domain in production, point `VITE_API_URL` at the
 * path the API is mounted on and CORS stops mattering.
 */

/**
 * Set in `.env`; the default is the Django dev server on whatever host this
 * page was opened from.
 *
 * Deriving the host rather than hard-coding `localhost` is what lets the app
 * work over the network. Open it at `http://192.168.0.x:5173` on a phone and
 * the API calls follow to `http://192.168.0.x:8000` — where `localhost` would
 * have meant the phone itself, and every request would have failed.
 *
 * `VITE_API_URL` still wins when it is set, which is what production wants:
 * point it at the path the API is mounted on behind a single domain.
 */
const devApiHost =
  typeof window === 'undefined' ? 'localhost' : window.location.hostname

export const API_URL = (
  import.meta.env.VITE_API_URL ?? `http://${devApiHost}:8000/api`
).replace(/\/+$/, '')

/**
 * A failed request, carrying the backend's own error code.
 *
 * Catch it to branch on `code` - a 409 means the inventory moved and the
 * screen should re-query, where a 400 means the form is wrong.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: Record<string, unknown>

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.detail = body.detail
  }

  /** True when the inventory moved rather than the request being wrong. */
  get isConflict() {
    return this.status === 409
  }

  /**
   * True when the request needs a signed-in account it did not have - either
   * nobody is signed in, or the stored token has expired.
   *
   * The screens that book read this to offer a sign-in instead of an error.
   */
  get needsSignIn() {
    return this.status === 401
  }

  /**
   * Field errors flattened to one message per field, ready for a form.
   *
   * DRF nests them - `{ contact: { phone: ['...'] } }` - so this walks down to
   * the first string it finds under each top-level key.
   */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!this.detail) return errors

    for (const [field, value] of Object.entries(this.detail)) {
      const message = firstString(value)
      if (message) errors[field] = message
    }
    return errors
  }
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      const found = firstString(entry)
      if (found) return found
    }
  }
  return null
}

/** Drops `undefined` and `null` so they never reach the query string. */
export type QueryParams = Record<string, string | number | boolean | undefined | null>

function buildUrl(path: string, params?: QueryParams) {
  const url = `${API_URL}${path}`
  if (!params) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  }

  const query = search.toString()
  return query ? `${url}?${query}` : url
}

async function toApiError(response: Response) {
  // A 500 or a proxy error is not JSON, and reading it must not throw over
  // the top of the real failure.
  let body: ApiErrorBody = {
    code: 'request_failed',
    message: `The server returned ${response.status}.`,
  }

  try {
    const parsed = (await response.json()) as Partial<ApiErrorEnvelope>
    if (parsed?.error?.code) body = parsed.error
  } catch {
    // Keep the fallback above.
  }

  return new ApiError(response.status, body)
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  // Sent on every request rather than only the ones that need it: the API
  // treats a missing token as anonymous, and search results do not change for
  // a signed-in traveller today - but a "your recent trips" panel would.
  const token = readToken()

  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch (cause) {
    // A dead server or a blocked origin never reaches an HTTP status, and the
    // browser's own "Failed to fetch" says nothing useful on screen.
    throw new ApiError(0, {
      code: 'network_error',
      message:
        'Could not reach the booking service. Check that the API is running.',
      detail: { url: path, cause: String(cause) },
    })
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

export function apiGet<T>(
  path: string,
  params?: QueryParams,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(buildUrl(path, params), { method: 'GET', signal })
}

export function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}
