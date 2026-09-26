import type { BookingPaymentState, Gender } from '@/types/common.types'

/** Where the traveller is in the booking wizard. */
export type BookingStep =
  | 'results'
  | 'seats'
  | 'passengers'
  | 'payment'
  | 'confirmation'

export type SeatKind = 'seater' | 'sleeper'
export type DeckName = 'lower' | 'upper'

/**
 * `ladies` seats are reservable, but only by a female passenger — the
 * passenger form locks the gender for them.
 */
export type SeatStatus = 'available' | 'booked' | 'ladies'

export interface Seat {
  /** Unique within a trip, e.g. `L4`, `U11`. Shown on the seat itself. */
  id: string
  deck: DeckName
  /** 1-based position on the deck grid; the aisle is a skipped column. */
  row: number
  column: number
  kind: SeatKind
  status: SeatStatus
  price: number
}

export interface Deck {
  name: DeckName
  rows: number
  columns: number
  /** Grid columns that are aisle rather than seating. */
  aisles: number[]
  seats: Seat[]
}

export interface StopPoint {
  id: string
  name: string
  landmark: string
  /** 24-hour `HH:MM`. */
  time: string
}

export interface BusTrip {
  id: string
  operator: string
  /** Marketing name, e.g. "Volvo 9600 Multi-Axle". */
  coach: string
  kind: SeatKind
  airConditioned: boolean
  /** Seat arrangement per row, e.g. "2+1". */
  layout: string
  departure: string
  arrival: string
  /** Minutes; formatted for display at the call site. */
  durationMinutes: number
  /** 0 = same day, 1 = arrives next morning. */
  arrivesNextDay: boolean
  rating: number
  ratingCount: number
  /** Lowest seat price on the bus; individual seats vary by deck. */
  fareFrom: number
  seatsLeft: number
  amenities: string[]
  boardingPoints: StopPoint[]
  droppingPoints: StopPoint[]
  cancellationPolicy: string
  liveTracking: boolean
}

export interface BusSearchQuery {
  from: string
  to: string
  /** `YYYY-MM-DD`. */
  date: string
}

export type BusSort = 'departure' | 'price-low' | 'price-high' | 'rating' | 'duration'

export interface BusFilters {
  /** Empty array means "no restriction" for each of these. */
  coachTypes: string[]
  departureWindows: string[]
  operators: string[]
}

export interface Passenger {
  seatId: string
  name: string
  age: string
  gender: Gender
}

export interface ContactDetails {
  email: string
  phone: string
}

export interface FareBreakdown {
  seatTotal: number
  serviceFee: number
  gst: number
  total: number
}

export interface BookingConfirmation extends BookingPaymentState {
  pnr: string
  bookedAt: string
  trip: BusTrip
  query: BusSearchQuery
  seats: Seat[]
  passengers: Passenger[]
  contact: ContactDetails
  boardingPoint: StopPoint
  droppingPoint: StopPoint
  fare: FareBreakdown
  /**
   * The instrument of the payment that went through - `rider@okhdfcbank`,
   * `Visa •••• 4242`, a bank or a wallet - or `''` while nothing has.
   * `payment` (from `BookingPaymentState`) carries the whole record.
   */
  /**
   * The instrument of the payment that went through - `rider@okhdfcbank`,
   * `Visa •••• 4242`, a bank or a wallet - or `''` while nothing has.
   * `payment` (from `BookingPaymentState`) carries the whole record.
   */
  paymentMethod: string
}

