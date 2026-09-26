import { apiGet, apiPost } from '@/services/api'
import type {
  BookingConfirmation,
  BusSearchQuery,
  BusTrip,
  ContactDetails,
  Deck,
  FareBreakdown,
  Passenger,
  Seat,
  StopPoint,
} from '@/types/bus.types'

/**
 * The bus booking API, under `/api/bus/`.
 *
 * Everything the backend returns is already in the shape of
 * `@/types/bus.types`, so these functions pass responses straight through.
 * What they do carry is the mapping on the way *in*: the screens hold whole
 * objects, and the API takes ids.
 */

/* ------------------------------------------------------------------
   Display helpers — pure, no round trip
   ------------------------------------------------------------------ */

function clockToMinutes(clock: string) {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToClock(totalMinutes: number) {
  const normalised = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalised / 60)
  const minutes = normalised % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** e.g. `7h 45m` — used wherever a duration is shown. */
export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export function minutesBefore(clock: string, offset: number) {
  return minutesToClock(clockToMinutes(clock) - offset)
}

/* ------------------------------------------------------------------
   Inventory
   ------------------------------------------------------------------ */

/** Services on a route for a date, with availability for that date. */
export function searchBuses(
  query: BusSearchQuery,
  signal?: AbortSignal,
): Promise<BusTrip[]> {
  return apiGet<BusTrip[]>(
    '/bus/trips/',
    { from: query.from, to: query.to, date: query.date },
    signal,
  )
}

/**
 * The seat map for one service on one date.
 *
 * The date matters and is not on the trip: a seat sold for Tuesday is still
 * on sale for Wednesday, so `status` is per date.
 */
export function fetchSeatLayout(
  trip: BusTrip,
  date: string,
  signal?: AbortSignal,
): Promise<Deck[]> {
  return apiGet<Deck[]>(`/bus/trips/${trip.id}/seats/`, { date }, signal)
}

/* ------------------------------------------------------------------
   Fare
   ------------------------------------------------------------------ */

const SERVICE_FEE = 25
const GST_RATE = 0.05

/**
 * Pure and synchronous, so the summary recalculates as seats are picked
 * without a round trip.
 *
 * These two constants are the same ones `bus/services.py` prices with. The
 * server recomputes on booking and its answer is what is charged; `quoteFare`
 * below is the authoritative version when it matters.
 */
export function calculateFare(seats: Seat[]): FareBreakdown {
  const seatTotal = seats.reduce((total, seat) => total + seat.price, 0)
  const serviceFee = seats.length > 0 ? SERVICE_FEE : 0
  const gst = Math.round((seatTotal + serviceFee) * GST_RATE)
  return { seatTotal, serviceFee, gst, total: seatTotal + serviceFee + gst }
}

export interface FareQuote extends FareBreakdown {
  /** Seats taken since the map was drawn. Empty means the quote still holds. */
  unavailableSeatIds: string[]
}

/** The server's own pricing, and whether the selection is still bookable. */
export function quoteFare(
  trip: BusTrip,
  date: string,
  seats: Seat[],
  signal?: AbortSignal,
): Promise<FareQuote> {
  return apiPost<FareQuote>(
    '/bus/quote/',
    { tripId: trip.id, date, seatIds: seats.map((seat) => seat.id) },
    signal,
  )
}

/* ------------------------------------------------------------------
   Booking
   ------------------------------------------------------------------ */

export interface ConfirmBookingInput {
  trip: BusTrip
  query: BusSearchQuery
  seats: Seat[]
  passengers: Passenger[]
  contact: ContactDetails
  boardingPoint: StopPoint
  droppingPoint: StopPoint
}

/**
 * Makes the booking as `pending`, holding what it sells. Nothing is
 * charged here: `payForBooking` in `payment.services` takes the money
 * for the reference this returns and turns it `confirmed`.
 *
 * Throws an `ApiError` with `code: 'seat_unavailable'` and status 409 when a
 * seat went while the traveller was filling in the form — the request was
 * fine, the inventory moved.
 */
export function confirmBooking(
  input: ConfirmBookingInput,
  signal?: AbortSignal,
): Promise<BookingConfirmation> {
  return apiPost<BookingConfirmation>(
    '/bus/bookings/',
    {
      tripId: input.trip.id,
      date: input.query.date,
      seatIds: input.seats.map((seat) => seat.id),
      passengers: input.passengers.map((passenger) => ({
        seatId: passenger.seatId,
        name: passenger.name,
        age: passenger.age,
        gender: passenger.gender,
      })),
      contact: input.contact,
      boardingPointId: input.boardingPoint.id,
      droppingPointId: input.droppingPoint.id,
    },
    signal,
  )
}

/** Looks a ticket up by its PNR. */
export function fetchBooking(
  pnr: string,
  signal?: AbortSignal,
): Promise<BookingConfirmation> {
  return apiGet<BookingConfirmation>(
    `/bus/bookings/${encodeURIComponent(pnr)}/`,
    undefined,
    signal,
  )
}
