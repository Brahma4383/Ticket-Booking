import { apiGet, apiPost } from '@/services/api'
import type { PaymentMethodId } from '@/types/common.types'
import type {
  AddOn,
  AddOnId,
  CabinLayout,
  FareBrand,
  FlightContact,
  FlightTraveller,
  FlightTrip,
  Layover,
  PlaneBookingConfirmation,
  PlaneFareBreakdown,
  PlaneSearchQuery,
} from '@/types/plane.types'

/**
 * The flight booking API, under `/api/plane/`.
 *
 * Everything the backend returns is already in the shape of
 * `@/types/plane.types`, so these functions pass responses straight through.
 * What they carry is the mapping on the way *in*: the screens hold whole
 * objects, and the API takes ids and codes.
 */

/* ------------------------------------------------------------------
   Display helpers — pure, no round trip
   ------------------------------------------------------------------ */

export function clockToMinutes(clock: string) {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** "Non-stop", "1 stop via DEL", "2 stops". */
export function describeStops(stops: Layover[]) {
  if (stops.length === 0) return 'Non-stop'
  if (stops.length === 1) return `1 stop via ${stops[0].code}`
  return `${stops.length} stops`
}

/* ------------------------------------------------------------------
   Inventory
   ------------------------------------------------------------------ */

/** Flights on a route for a date, with the seats left on each. */
export function searchFlights(
  query: PlaneSearchQuery,
  signal?: AbortSignal,
): Promise<FlightTrip[]> {
  return apiGet<FlightTrip[]>(
    '/plane/flights/',
    {
      from: query.from,
      to: query.to,
      date: query.date,
      travellers: query.travellers,
    },
    signal,
  )
}

/**
 * The cabin map for one flight on one date.
 *
 * The date matters and is not on the trip: `occupied` is per date, because a
 * seat sold for Tuesday is free again on Wednesday.
 */
export function fetchCabinLayout(
  trip: FlightTrip,
  date: string,
  signal?: AbortSignal,
): Promise<CabinLayout> {
  return apiGet<CabinLayout>(
    `/plane/flights/${trip.id}/seats/`,
    { date },
    signal,
  )
}

/* ------------------------------------------------------------------
   Add-ons
   ------------------------------------------------------------------ */

/**
 * The add-ons the seat step offers before the live list arrives.
 *
 * `flight_addon` is the real source and `fetchAddOns` reads it; these are the
 * rows `schema.sql` seeds, kept so the step renders something on first paint
 * and so `calculatePlaneFare` has prices without waiting.
 */
export const ADD_ONS: AddOn[] = [
  {
    id: 'meal',
    label: 'Pre-book a meal',
    description: 'Hot vegetarian or non-vegetarian meal, served on board.',
    price: 400,
  },
  {
    id: 'baggage',
    label: 'Extra 5 kg check-in baggage',
    description: 'Cheaper now than at the airport counter.',
    price: 750,
  },
  {
    id: 'priority',
    label: 'Priority check-in and boarding',
    description: 'Dedicated counter and first boarding group.',
    price: 300,
  },
]

/** The add-ons actually on sale, with live prices. */
export function fetchAddOns(signal?: AbortSignal): Promise<AddOn[]> {
  return apiGet<AddOn[]>('/plane/addons/', undefined, signal)
}

/* ------------------------------------------------------------------
   Fare
   ------------------------------------------------------------------ */

const TAX_RATE = 0.12
const FIXED_LEVY_PER_TRAVELLER = 236
const CONVENIENCE_FEE_PER_TRAVELLER = 149

/**
 * Pure and synchronous, so the summary recalculates as travellers and add-ons
 * are picked without a round trip.
 *
 * `addOns` defaults to the seeded list; pass the fetched one to price against
 * live figures. The server recomputes on booking and its answer is what is
 * charged — `quotePlaneFare` below is the authoritative version.
 */
export function calculatePlaneFare({
  fareBrand,
  travellerCount,
  seatTotal,
  addOnIds,
  addOns = ADD_ONS,
}: {
  fareBrand: FareBrand | null
  travellerCount: number
  seatTotal: number
  addOnIds: AddOnId[]
  addOns?: AddOn[]
}): PlaneFareBreakdown {
  if (!fareBrand || travellerCount === 0) {
    return {
      baseFare: 0,
      taxes: 0,
      seats: 0,
      addOns: 0,
      convenienceFee: 0,
      total: 0,
    }
  }

  const baseFare = fareBrand.price * travellerCount
  const taxes =
    Math.round(baseFare * TAX_RATE) + FIXED_LEVY_PER_TRAVELLER * travellerCount
  const addOnTotal = addOnIds.reduce((sum, id) => {
    const addOn = addOns.find((entry) => entry.id === id)
    return sum + (addOn ? addOn.price * travellerCount : 0)
  }, 0)
  const convenienceFee = CONVENIENCE_FEE_PER_TRAVELLER * travellerCount

  return {
    baseFare,
    taxes,
    seats: seatTotal,
    addOns: addOnTotal,
    convenienceFee,
    total: baseFare + taxes + seatTotal + addOnTotal + convenienceFee,
  }
}

export interface PlaneFareQuote extends PlaneFareBreakdown {
  /** Seats taken since the cabin was drawn. Empty means the quote holds. */
  unavailableSeatIds: string[]
}

/** The server's own pricing, and whether the seats are still free. */
export function quotePlaneFare(
  {
    trip,
    date,
    fareBrand,
    travellerCount,
    seatIds,
    addOnIds,
  }: {
    trip: FlightTrip
    date: string
    fareBrand: FareBrand
    travellerCount: number
    seatIds: string[]
    addOnIds: AddOnId[]
  },
  signal?: AbortSignal,
): Promise<PlaneFareQuote> {
  return apiPost<PlaneFareQuote>(
    '/plane/quote/',
    {
      flightId: trip.id,
      date,
      fareBrandCode: fareBrand.id,
      travellerCount,
      seatIds,
      addOns: addOnIds,
    },
    signal,
  )
}

/* ------------------------------------------------------------------
   Booking
   ------------------------------------------------------------------ */

export interface ConfirmFlightBookingInput {
  trip: FlightTrip
  query: PlaneSearchQuery
  fareBrand: FareBrand
  travellers: FlightTraveller[]
  /** Traveller id -> seat id. Infants are absent. */
  seatByTraveller: Record<string, string>
  addOns: AddOnId[]
  contact: FlightContact
  /** The label shown on the payment step, e.g. `UPI` or `HDFC Bank`. */
  paymentMethod: string
  /** Which of the four methods that label belongs to. */
  paymentMethodId: PaymentMethodId
}

/**
 * Takes payment, takes the seats and issues the tickets.
 *
 * The seat total is not sent: the server prices the seats it actually
 * assigns, so a client cannot understate it.
 *
 * Throws an `ApiError` with `code: 'seat_unavailable'` and status 409 when a
 * seat went while the traveller was filling in the form.
 */
export function confirmFlightBooking(
  input: ConfirmFlightBookingInput,
  signal?: AbortSignal,
): Promise<PlaneBookingConfirmation> {
  return apiPost<PlaneBookingConfirmation>(
    '/plane/bookings/',
    {
      flightId: input.trip.id,
      date: input.query.date,
      fareBrandCode: input.fareBrand.id,
      travellers: input.travellers.map((traveller) => ({
        id: traveller.id,
        type: traveller.type,
        title: traveller.title,
        firstName: traveller.firstName,
        lastName: traveller.lastName,
        dateOfBirth: traveller.dateOfBirth || null,
      })),
      seatByTraveller: input.seatByTraveller,
      addOns: input.addOns,
      contact: input.contact,
      paymentMethod: input.paymentMethod,
      paymentMethodId: input.paymentMethodId,
    },
    signal,
  )
}

/** Looks a ticket up by its six-character booking reference. */
export function fetchFlightBooking(
  reference: string,
  signal?: AbortSignal,
): Promise<PlaneBookingConfirmation> {
  return apiGet<PlaneBookingConfirmation>(
    `/plane/bookings/${encodeURIComponent(reference)}/`,
    undefined,
    signal,
  )
}
