import { apiGet, apiPost } from '@/services/api'
import type { BookingMode } from '@/types/account.types'
import type {
  PaymentMethodId,
  PaymentRecord,
  PaymentRequest,
} from '@/types/common.types'
import type {
  PaymentOrder,
  Receipt,
  Transaction,
} from '@/types/payment.types'

/**
 * The payment API, under `/api/payments/`.
 *
 * Booking is two steps. A mode's `confirm*` call makes the booking as
 * `pending`, which holds its seats, berths or room nights for a quarter of
 * an hour; `payForBooking` then takes the money for that reference. A
 * payment that goes through moves the booking to `confirmed`; one that is
 * declined is recorded and can be retried until the hold runs out.
 */

/* ------------------------------------------------------------------
   What the form offers
   ------------------------------------------------------------------ */

export const METHOD_LABELS: Record<PaymentMethodId, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
}

/** The same lists the server validates against, in the same order. */
export const BANKS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
]

export const WALLETS = ['Paytm', 'Amazon Pay', 'PhonePe Wallet', 'Mobikwik']

/**
 * The gateway behind the API is a sandbox: nothing is charged, and its
 * answers are scripted so the failure path can be seen on purpose. These
 * are the scripts, printed under the form.
 */
export const SANDBOX_NOTES = [
  'Any well-formed UPI ID pays; failure@upi is declined.',
  'Card 4242 4242 4242 4242 pays, with any future expiry and any CVV.',
  '4000 0000 0000 0002 is declined; 4000 0000 0000 9995 has insufficient funds.',
  'Every bank and wallet on the list pays.',
]

/* ------------------------------------------------------------------
   Paying
   ------------------------------------------------------------------ */

/** What `payForBooking` answers with: the payment, and the ticket with it. */
export interface PaymentResult<T> {
  payment: PaymentRecord
  /** The mode's own confirmation, now `confirmed`, nothing left to fetch. */
  booking: T
}

/**
 * Pay for a pending booking.
 *
 * `T` is the mode's confirmation type, so the wizard that called this gets
 * back exactly what its ticket screen renders.
 *
 * Throws an `ApiError`:
 *
 * - `payment_declined` (402): the gateway said no. The failed attempt is on
 *   record — `detail.transactionRef` names it — and the booking is still
 *   held, so the same call can be made again with another instrument.
 * - `payment_expired` (409): the hold ran out first and the booking has
 *   been released. Only a new booking helps.
 * - `invalid` (400): the instrument is malformed; `detail` names the field.
 *
 * Paying for a booking that is already confirmed answers with the payment
 * that confirmed it, so a retry after a dropped connection is harmless.
 */
export function payForBooking<T>(
  mode: BookingMode,
  reference: string,
  request: PaymentRequest,
  signal?: AbortSignal,
): Promise<PaymentResult<T>> {
  return apiPost<PaymentResult<T>>(
    `/payments/${mode}/${encodeURIComponent(reference)}/`,
    request,
    signal,
  )
}

/**
 * What a booking still owes, with every attempt so far and the fare lines to
 * show beside the form. For the "complete payment" link on the account page.
 */
export function fetchPaymentOrder(
  mode: BookingMode,
  reference: string,
  signal?: AbortSignal,
): Promise<PaymentOrder> {
  return apiGet<PaymentOrder>(
    `/payments/${mode}/${encodeURIComponent(reference)}/`,
    undefined,
    signal,
  )
}

/* ------------------------------------------------------------------
   Reading back
   ------------------------------------------------------------------ */

interface TransactionsResponse {
  transactions: Transaction[]
}

/** Every attempt this account has made, succeeded or not, newest first. */
export function fetchTransactions(
  signal?: AbortSignal,
): Promise<Transaction[]> {
  return apiGet<TransactionsResponse>('/payments/', undefined, signal).then(
    (body) => body.transactions,
  )
}

/** One attempt with the fare it paid for. */
export function fetchReceipt(
  transactionRef: string,
  signal?: AbortSignal,
): Promise<Receipt> {
  return apiGet<Receipt>(
    `/payments/${encodeURIComponent(transactionRef)}/`,
    undefined,
    signal,
  )
}

/* ------------------------------------------------------------------
   Display helpers — pure, no round trip
   ------------------------------------------------------------------ */

/** `14:32` — when a hold runs out, in the traveller's own clock. */
export function formatClock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

/** `26 Sep 2026, 14:32` — when a payment went through, for a receipt. */
export function formatMoment(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
