import type { BookingPaymentState, Gender } from '@/types/common.types'

export type TrainStep =
  | 'trains'
  | 'review'
  | 'passengers'
  | 'payment'
  | 'confirmation'

/** Reservation classes, in the order they are shown on a train card. */
export type TrainClassCode = '1A' | '2A' | '3A' | '3E' | 'CC' | 'SL' | '2S'

export type QuotaId = 'general' | 'tatkal' | 'ladies' | 'senior'

/**
 * Indian Railways availability states. RAC means a shared seat that usually
 * becomes a full berth; waitlisted tickets are refunded if they never confirm.
 */
export type AvailabilityKind = 'available' | 'rac' | 'waitlist' | 'unavailable'

export interface Availability {
  kind: AvailabilityKind
  /** Seats free, or the RAC/waitlist position. */
  count: number
  /** What the railways would print, e.g. `AVAILABLE-0042`, `RAC 12`, `GNWL 25`. */
  label: string
  /** Percent likelihood of confirming; only meaningful for RAC and waitlist. */
  confirmChance: number
}

export interface TrainClassOption {
  code: TrainClassCode
  label: string
  /** Base fare for one adult under the general quota. */
  fare: number
  availability: Availability
}

export interface Station {
  code: string
  name: string
}

export interface BoardingStation extends Station {
  /** 24-hour `HH:MM` departure from this station. */
  time: string
  /** Day offset from the journey date. */
  dayOffset: number
}

export interface TrainTrip {
  id: string
  /** Five-digit train number. */
  number: string
  name: string
  from: Station
  to: Station
  departure: string
  arrival: string
  durationMinutes: number
  /** Nights spent on board; 0 means it arrives the same day. */
  daysToArrive: number
  /** Seven booleans, Monday first. */
  runsOn: boolean[]
  classes: TrainClassOption[]
  pantry: boolean
  rating: number
  boardingStations: BoardingStation[]
  /** Free-text, shown on the review step. */
  cancellationPolicy: string
}

export interface TrainSearchQuery {
  from: string
  to: string
  /** `YYYY-MM-DD`. */
  date: string
}

export type TrainSort =
  | 'departure'
  | 'arrival'
  | 'duration'
  | 'price-low'
  | 'availability'

export interface TrainFilters {
  classes: TrainClassCode[]
  departureWindows: string[]
  /** Only show trains with at least one class confirmed available. */
  availableOnly: boolean
}

/**
 * Berth preference is a request, not a guarantee — the railways allot on
 * confirmation, which is why the ticket shows a different berth than asked.
 */
export type BerthPreference =
  | 'no-preference'
  | 'lower'
  | 'middle'
  | 'upper'
  | 'side-lower'
  | 'side-upper'

export interface TrainPassenger {
  /** Stable key; passengers are added and removed by hand here. */
  id: string
  name: string
  age: string
  gender: Gender
  berth: BerthPreference
}

/** A passenger once the chart is prepared. */
export interface AllottedPassenger extends TrainPassenger {
  coach: string
  berth: BerthPreference
  /** `CNF S4 / 32 / Lower`, `RAC 5`, `WL 3`. */
  status: string
  allottedBerth: string
}

export interface TrainContact {
  email: string
  phone: string
}

export interface TrainFareBreakdown {
  baseFare: number
  /** Tatkal premium, zero under every other quota. */
  quotaSurcharge: number
  reservationCharge: number
  /** ₹0.45 per passenger, only when insurance is taken. */
  insurance: number
  /** Levied on air-conditioned classes only. */
  gst: number
  total: number
}

export interface TrainBookingConfirmation extends BookingPaymentState {
  pnr: string
  bookedAt: string
  trip: TrainTrip
  query: TrainSearchQuery
  classOption: TrainClassOption
  quota: QuotaId
  boardingStation: BoardingStation
  passengers: AllottedPassenger[]
  contact: TrainContact
  fare: TrainFareBreakdown
  /**
   * The instrument of the payment that went through - `rider@okhdfcbank`,
   * `Visa •••• 4242`, a bank or a wallet - or `''` while nothing has.
   * `payment` (from `BookingPaymentState`) carries the whole record.
   */
  paymentMethod: string
  insured: boolean
  /** `Chart not prepared` until a day before departure, in real life. */
  chartStatus: string
}
