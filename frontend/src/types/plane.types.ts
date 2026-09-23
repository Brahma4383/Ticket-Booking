export type PlaneStep =
  | 'flights'
  | 'travellers'
  | 'seats'
  | 'payment'
  | 'confirmation'

export type CabinClass = 'economy' | 'premium' | 'business'

export interface Airport {
  /** IATA code, e.g. `BOM`. */
  code: string
  city: string
  name: string
  terminal: string
}

/**
 * A fare family. Airlines sell the same seat under several brands that differ
 * on baggage and change rules rather than on the flight itself.
 */
export type FareBrandId = 'saver' | 'comfort' | 'flexi'

/** How favourable a rule is, worst to best. */
export type RuleTier = 'fee' | 'reduced' | 'free'

export interface FareBrand {
  id: FareBrandId
  name: string
  price: number
  cabinBaggageKg: number
  checkInBaggageKg: number
  cancellation: string
  cancellationTier: RuleTier
  dateChange: string
  dateChangeTier: RuleTier
  /** Whether seat selection costs extra under this brand. */
  freeSeat: boolean
  mealIncluded: boolean
}

/** An intermediate stop; `layoverMinutes` is time on the ground. */
export interface Layover {
  code: string
  city: string
  layoverMinutes: number
}

export interface FlightTrip {
  id: string
  airline: string
  /** Two-character carrier code, e.g. `6E`. */
  airlineCode: string
  flightNumber: string
  aircraft: string
  from: Airport
  to: Airport
  departure: string
  arrival: string
  durationMinutes: number
  /** 0 when it lands the same day. */
  daysToArrive: number
  /** Empty for a non-stop flight. */
  stops: Layover[]
  cabin: CabinClass
  fares: FareBrand[]
  /** Percentage of departures on time over the last month. */
  onTime: number
  seatsLeft: number
}

export interface PlaneSearchQuery {
  from: string
  to: string
  /** `YYYY-MM-DD`. */
  date: string
  /** Seeded from the home search panel's travellers field. */
  travellers: number
}

export type PlaneSort =
  | 'departure'
  | 'arrival'
  | 'duration'
  | 'price-low'
  | 'stops'

export interface PlaneFilters {
  /** Number of stops to allow; empty means any. */
  stops: number[]
  airlines: string[]
  departureWindows: string[]
  nonStopOnly: boolean
}

/* ------------------------------------------------------------------
   Travellers
   ------------------------------------------------------------------ */

export type TravellerType = 'adult' | 'child' | 'infant'

export type Title = 'Mr' | 'Ms' | 'Mrs' | 'Master' | 'Miss'

export interface FlightTraveller {
  id: string
  type: TravellerType
  title: Title
  firstName: string
  lastName: string
  /** `YYYY-MM-DD`; required for children and infants. */
  dateOfBirth: string
}

export interface FlightContact {
  email: string
  phone: string
}

/* ------------------------------------------------------------------
   Cabin seat map
   ------------------------------------------------------------------ */

export type SeatZone = 'front' | 'extra-legroom' | 'standard'

export interface CabinSeat {
  /** e.g. `12A`. */
  id: string
  row: number
  column: string
  zone: SeatZone
  /** Zero means the seat is free to pick. */
  price: number
  occupied: boolean
  window: boolean
  aisle: boolean
}

export interface CabinRow {
  number: number
  /** Rows beside an emergency exit carry extra legroom and age limits. */
  exitRow: boolean
  seats: CabinSeat[]
}

export interface CabinLayout {
  /** Seat letters in order, with `null` marking the aisle. */
  columns: (string | null)[]
  rows: CabinRow[]
}

export type AddOnId = 'meal' | 'baggage' | 'priority'

export interface AddOn {
  id: AddOnId
  label: string
  description: string
  /** Charged once per traveller. */
  price: number
}

/* ------------------------------------------------------------------
   Fare and confirmation
   ------------------------------------------------------------------ */

export interface PlaneFareBreakdown {
  baseFare: number
  /** Airline surcharges plus government levies. */
  taxes: number
  seats: number
  addOns: number
  convenienceFee: number
  total: number
}

export interface TicketedTraveller extends FlightTraveller {
  /** Null when no seat was chosen; infants never get one. */
  seatId: string | null
  /** 13-digit e-ticket number. */
  eTicket: string
}

export interface PlaneBookingConfirmation {
  /** Six-character airline booking reference. */
  reference: string
  bookedAt: string
  trip: FlightTrip
  query: PlaneSearchQuery
  fareBrand: FareBrand
  travellers: TicketedTraveller[]
  contact: FlightContact
  addOns: AddOnId[]
  fare: PlaneFareBreakdown
  paymentMethod: string
}
