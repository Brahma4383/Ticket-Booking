import type { BookingPaymentState } from '@/types/common.types'

export type CabStep = 'cabs' | 'details' | 'payment' | 'confirmation'

export type CabCategoryId = 'hatchback' | 'sedan' | 'suv' | 'premium'

/** What kind of journey the route implies, which drives how fares are built. */
export type TripType = 'outstation' | 'airport' | 'local'

export interface CabOption {
  id: string
  category: CabCategoryId
  name: string
  /** Representative models, e.g. "Swift Dzire, Etios or similar". */
  models: string
  seats: number
  /** Number of large bags that fit. */
  luggage: number
  airConditioned: boolean
  /** Fare for the whole trip, before extras and taxes. */
  baseFare: number
  includedKm: number
  extraKmRate: number
  inclusions: string[]
  exclusions: string[]
  cancellation: string
  rating: number
  /** Typical wait at pickup. */
  etaMinutes: number
}

export interface CabSearchQuery {
  pickup: string
  drop: string
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM`. */
  time: string
}

export interface TripEstimate {
  distanceKm: number
  durationMinutes: number
  tripType: TripType
  /** True between 22:00 and 06:00, when a night allowance applies. */
  nightTrip: boolean
}

export type CabExtraId = 'carrier' | 'childSeat' | 'extraStop'

export interface CabExtra {
  id: CabExtraId
  label: string
  description: string
  price: number
}

export interface CabTripDetails {
  pickupAddress: string
  dropAddress: string
  date: string
  time: string
  name: string
  phone: string
  email: string
}

export interface CabFareBreakdown {
  baseFare: number
  extras: number
  /** Paid to the driver for overnight trips. */
  driverAllowance: number
  /** Estimated; settled against actual receipts. */
  tollsAndStateTax: number
  nightCharge: number
  gst: number
  total: number
  /** Advance taken now; the rest is settled with the driver. */
  payNow: number
  payToDriver: number
}

export interface CabBookingConfirmation extends BookingPaymentState {
  /** Eight-character trip id. */
  bookingId: string
  bookedAt: string
  option: CabOption
  query: CabSearchQuery
  estimate: TripEstimate
  details: CabTripDetails
  extras: CabExtraId[]
  fare: CabFareBreakdown
  /**
   * The instrument of the payment that went through - `rider@okhdfcbank`,
   * `Visa •••• 4242`, a bank or a wallet - or `''` while nothing has.
   * `payment` (from `BookingPaymentState`) carries the whole record.
   */
  paymentMethod: string
}
