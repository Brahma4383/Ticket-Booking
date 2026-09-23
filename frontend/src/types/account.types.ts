/** The five things this app books. Mirrors `booking.mode` in the database. */
export type BookingMode = 'bus' | 'train' | 'plane' | 'hotel' | 'cab'

/** Mirrors `booking.status`. Only `confirmed` is a ticket you can travel on. */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'failed'

/**
 * One row of the account's ticket list, as `GET /api/auth/me/bookings/`
 * returns it.
 *
 * Every mode fills the same shape, which is what lets the account page render
 * one card rather than five. Anything richer than this lives on the ticket
 * itself — the mode's own `bookings/<reference>/` returns that in full, and
 * the list only fetches it when a row is opened.
 */
export interface BookingSummary {
  /** The PNR or booking id printed on the ticket. */
  reference: string
  mode: BookingMode
  status: BookingStatus
  /** `Mumbai → Pune`, or the property name for a stay. */
  title: string
  /** A mode-specific one-liner: the operator, the train, the room count. */
  detail: string
  /** An ISO date — or an ISO date*time* for a cab, which has a pickup hour. */
  travelDate: string
  /** Only stays set this: the check-out date, so the card can show a range. */
  endDate: string | null
  amount: number
  currency: string
  /** ISO 8601. What the list is sorted by, newest first. */
  bookedAt: string
}
