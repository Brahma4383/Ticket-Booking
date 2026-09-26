import { apiGet, apiPost } from '@/services/api'
import type {
  CabBookingConfirmation,
  CabExtra,
  CabExtraId,
  CabFareBreakdown,
  CabOption,
  CabSearchQuery,
  CabTripDetails,
  TripEstimate,
  TripType,
} from '@/types/cab.types'

/**
 * The cabs booking API, under `/api/cab/`.
 *
 * Everything the backend returns is already in the shape of
 * `@/types/cab.types`, so these functions pass responses straight through.
 * What they carry is the mapping on the way *in*: the screens hold whole
 * objects, and the API takes codes.
 */

/* ------------------------------------------------------------------
   Display helpers — pure, no round trip
   ------------------------------------------------------------------ */

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  outstation: 'Outstation one way',
  airport: 'Airport transfer',
  local: 'Local trip',
}

export const ARRIVAL_BUFFER_NOTE =
  'Driver and vehicle details are shared two hours before pickup.'

/**
 * Extras the details step offers before the live list arrives.
 *
 * `cab_extra` is the real source and `fetchCabExtras` reads it; these are the
 * rows `schema.sql` seeds, kept so the step renders something on first paint
 * and so `calculateCabFare` has prices without waiting. They are charged once
 * for the trip, not per passenger.
 */
export const CAB_EXTRAS: CabExtra[] = [
  {
    id: 'carrier',
    label: 'Roof carrier',
    description: 'For bulky luggage that will not fit in the boot.',
    price: 300,
  },
  {
    id: 'childSeat',
    label: 'Child seat',
    description: 'Rear-facing seat for children under four.',
    price: 250,
  },
  {
    id: 'extraStop',
    label: 'One extra stop',
    description: 'A halt of up to 30 minutes along the route.',
    price: 200,
  },
]

/** The extras actually on sale, with live prices. */
export function fetchCabExtras(signal?: AbortSignal): Promise<CabExtra[]> {
  return apiGet<CabExtra[]>('/cab/extras/', undefined, signal)
}

/* ------------------------------------------------------------------
   Estimation
   ------------------------------------------------------------------ */

/**
 * Distance, duration, kind of journey, and whether it runs overnight.
 *
 * The server decides all four, because every one of them moves the fare — an
 * understated distance would be an understated price. That is why this is a
 * request rather than the local calculation it used to be.
 */
export function estimateTrip(
  query: CabSearchQuery,
  signal?: AbortSignal,
): Promise<TripEstimate> {
  return apiGet<TripEstimate>(
    '/cab/estimate/',
    {
      pickup: query.pickup,
      drop: query.drop,
      date: query.date,
      time: query.time,
    },
    signal,
  )
}

/* ------------------------------------------------------------------
   Inventory
   ------------------------------------------------------------------ */

/**
 * Every cab type priced for this journey, cheapest first.
 *
 * A category with no rate card in force for the trip type and date is not
 * offered — it is not on sale for that journey.
 */
export function searchCabs(
  query: CabSearchQuery,
  signal?: AbortSignal,
): Promise<CabOption[]> {
  return apiGet<CabOption[]>(
    '/cab/cabs/',
    {
      pickup: query.pickup,
      drop: query.drop,
      date: query.date,
      time: query.time,
    },
    signal,
  )
}

/* ------------------------------------------------------------------
   Fare
   ------------------------------------------------------------------ */

const NIGHT_CHARGE = 250
const DRIVER_ALLOWANCE_PER_NIGHT = 300
const GST_RATE = 0.05
/** Advance taken online; the balance is settled with the driver. */
const ADVANCE_SHARE = 0.2
/** Rough tolls and state permit on an intercity run, per kilometre. */
const TOLL_PER_KM = 2.4
/** Below this an outstation run gets the driver home the same night. */
const OVERNIGHT_DISTANCE_KM = 250

const ZERO_FARE: CabFareBreakdown = {
  baseFare: 0,
  extras: 0,
  driverAllowance: 0,
  tollsAndStateTax: 0,
  nightCharge: 0,
  gst: 0,
  total: 0,
  payNow: 0,
  payToDriver: 0,
}

/**
 * Pure and synchronous, so the summary recalculates as extras are ticked
 * without a round trip.
 *
 * The allowance and night charge here mirror the rate card's own columns.
 * The server recomputes on booking and its answer is what is charged;
 * `quoteCabFare` below is the authoritative version when it matters.
 */
export function calculateCabFare({
  option,
  estimate,
  extraIds,
  extras = CAB_EXTRAS,
}: {
  option: CabOption | null
  estimate: TripEstimate | null
  extraIds: CabExtraId[]
  extras?: CabExtra[]
}): CabFareBreakdown {
  if (!option || !estimate) return ZERO_FARE

  const extrasTotal = extraIds.reduce((sum, id) => {
    const extra = extras.find((entry) => entry.id === id)
    return sum + (extra?.price ?? 0)
  }, 0)

  // Long outstation runs keep the driver overnight.
  const driverAllowance =
    estimate.tripType === 'outstation' &&
    estimate.distanceKm > OVERNIGHT_DISTANCE_KM
      ? DRIVER_ALLOWANCE_PER_NIGHT
      : 0
  const tollsAndStateTax =
    estimate.tripType === 'outstation'
      ? Math.round((estimate.distanceKm * TOLL_PER_KM) / 10) * 10
      : 0
  const nightCharge = estimate.nightTrip ? NIGHT_CHARGE : 0

  const taxable =
    option.baseFare +
    extrasTotal +
    driverAllowance +
    tollsAndStateTax +
    nightCharge
  const gst = Math.round(taxable * GST_RATE)
  const total = taxable + gst
  const payNow = Math.round((total * ADVANCE_SHARE) / 10) * 10

  return {
    baseFare: option.baseFare,
    extras: extrasTotal,
    driverAllowance,
    tollsAndStateTax,
    nightCharge,
    gst,
    total,
    payNow,
    payToDriver: total - payNow,
  }
}

export interface CabFareQuote extends CabFareBreakdown {
  /** The estimate the fare was built on, so nothing needs a second call. */
  estimate: TripEstimate
}

/** The server's own pricing for one cab on this journey. */
export function quoteCabFare(
  {
    option,
    query,
    extraIds,
  }: {
    option: CabOption
    query: CabSearchQuery
    extraIds: CabExtraId[]
  },
  signal?: AbortSignal,
): Promise<CabFareQuote> {
  return apiPost<CabFareQuote>(
    '/cab/quote/',
    {
      categoryCode: option.category,
      pickup: query.pickup,
      drop: query.drop,
      date: query.date,
      time: query.time,
      extras: extraIds,
    },
    signal,
  )
}

/* ------------------------------------------------------------------
   Booking
   ------------------------------------------------------------------ */

export interface ConfirmCabInput {
  option: CabOption
  query: CabSearchQuery
  details: CabTripDetails
  extras: CabExtraId[]
}

/**
 * Makes the booking as `pending`, holding what it sells. Nothing is
 * charged here: `payForBooking` in `payment.services` takes the money
 * for the reference this returns and turns it `confirmed`.
 *
 * The estimate is not sent: distance, duration, trip type and the night flag
 * are worked out from the addresses and the pickup time on the server,
 * because every one of them moves the fare.
 *
 * Only the advance is charged — the driver collects the balance, which is why
 * `fare.payNow` and `fare.total` differ.
 *
 * Throws an `ApiError` with `code: 'no_rate_card'` and status 409 when
 * nothing is priced for that cab and journey on that date.
 */
export function confirmCab(
  input: ConfirmCabInput,
  signal?: AbortSignal,
): Promise<CabBookingConfirmation> {
  return apiPost<CabBookingConfirmation>(
    '/cab/bookings/',
    {
      categoryCode: input.option.category,
      date: input.details.date,
      time: input.details.time,
      details: {
        pickupAddress: input.details.pickupAddress,
        dropAddress: input.details.dropAddress,
        name: input.details.name,
        phone: input.details.phone,
        email: input.details.email,
      },
      extras: input.extras,
    },
    signal,
  )
}

/** Looks a trip voucher up by its eight-character booking id. */
export function fetchCabBooking(
  bookingId: string,
  signal?: AbortSignal,
): Promise<CabBookingConfirmation> {
  return apiGet<CabBookingConfirmation>(
    `/cab/bookings/${encodeURIComponent(bookingId)}/`,
    undefined,
    signal,
  )
}
