import type { BookingMode, BookingStatus } from '@/types/account.types'
import type { PaymentRecord } from '@/types/common.types'

/**
 * What `/api/payments/` returns, beyond the `PaymentRecord` every ticket
 * already embeds: the account's transaction history and its receipts.
 */

/**
 * The little a receipt says about its booking: only what the shared
 * `booking` table holds. The route, the property or the train are the
 * mode's to describe, and the account page has them from its own list.
 */
export interface TransactionBooking {
  reference: string
  mode: BookingMode
  status: BookingStatus
  contactEmail: string
  contactPhone: string
  totalAmount: number
  currency: string
  bookedAt: string
  cancelledAt: string | null
  holdExpiresAt: string | null
}

/** One row of the account's transaction list. */
export interface Transaction extends PaymentRecord {
  booking: TransactionBooking
}

export interface FareLineRecord {
  label: string
  amount: number
}

/** A transaction with the fare it paid for. */
export interface Receipt extends Transaction {
  fareLines: FareLineRecord[]
}

/**
 * What a pending booking still owes, for the "complete payment" screen
 * reached from the account page.
 */
export interface PaymentOrder {
  booking: TransactionBooking
  /** What the gateway will be asked for: the fare, or a cab's advance. */
  amountDue: number
  currency: string
  holdExpiresAt: string | null
  /** Every attempt so far, oldest first. */
  payments: PaymentRecord[]
  fareLines: FareLineRecord[]
}
