import { apiGet, apiPost } from '@/services/api'
import type { BookingMode, BookingSummary } from '@/types/account.types'

/**
 * What the signed-in account holds, under `/api/auth/me/`.
 *
 * Separate from `auth.services` on purpose: that module is about becoming
 * signed in, this one is about what being signed in gets you.
 */

interface MyBookingsResponse {
  bookings: BookingSummary[]
}

/**
 * Every ticket this account has booked, across all five modes, newest first.
 *
 * One request rather than five. The server merges and sorts, so the page has
 * a single loading state and the ordering is right across modes — which five
 * parallel calls could not give without the client re-sorting them.
 *
 * Throws an `ApiError` with `needsSignIn` when the stored token has expired.
 */
export function fetchMyBookings(
  signal?: AbortSignal,
): Promise<BookingSummary[]> {
  return apiGet<MyBookingsResponse>('/auth/me/bookings/', undefined, signal)
    .then((body) => body.bookings)
}


/** What the cancel endpoint answers with. */
export interface CancellationResult {
  /** The same row the list holds, now cancelled - swapped in place of it. */
  booking: BookingSummary
  /** Decimal string, to be parsed by the caller that formats money. */
  refundAmount: string
  currency: string
}

/**
 * Cancel one ticket and get the refund back.
 *
 * POST, not DELETE: the booking stays, with its reference and its passengers,
 * and moves to `cancelled`. The travel module behind it gives the inventory
 * back - seats, berths or room nights - which is why this is one endpoint
 * rather than five.
 *
 * Throws an `ApiError`; `cancellation_not_allowed` means the booking is real
 * but past, already cancelled or already completed.
 */
export function cancelBooking(
  mode: BookingMode,
  reference: string,
  signal?: AbortSignal,
): Promise<CancellationResult> {
  return apiPost<CancellationResult>(
    `/auth/me/bookings/${mode}/${encodeURIComponent(reference)}/cancel/`,
    {},
    signal,
  )
}
