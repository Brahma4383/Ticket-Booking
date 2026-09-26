import { apiGet, apiPost } from '@/services/api'
import type {
  GuestDetails,
  HotelBookingConfirmation,
  HotelFareBreakdown,
  HotelSearchQuery,
  Property,
  PropertyType,
  RatePlan,
  RoomType,
} from '@/types/hotel.types'

/**
 * The stays booking API, under `/api/hotel/`.
 *
 * Everything the backend returns is already in the shape of
 * `@/types/hotel.types`, so these functions pass responses straight through.
 * What they carry is the mapping on the way *in*: the screens hold whole
 * objects, and the API takes ids and codes.
 */

/* ------------------------------------------------------------------
   Reference data
   ------------------------------------------------------------------ */

/** The five kinds of stay, matching the CHECK constraint on `property`. */
export const PROPERTY_TYPES: PropertyType[] = [
  'Hotel',
  'Resort',
  'Homestay',
  'Hostel',
  'Apartment',
]

/**
 * Facets the filter sidebar offers before the live list arrives.
 *
 * `hotel_amenity` is the real source and `fetchAmenities` reads it, narrowed
 * to one city so the sidebar never shows a facet that matches nothing. These
 * are the rows `schema.sql` seeds, kept so the sidebar renders on first paint.
 */
export const HOTEL_AMENITIES = [
  'Free Wi-Fi',
  'Swimming pool',
  'Fitness centre',
  'Free parking',
  'Restaurant',
  'Room service',
  'Airport shuttle',
  'Power backup',
]

/** Amenity names, optionally narrowed to the ones a city actually offers. */
export function fetchAmenities(
  city?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  return apiGet<string[]>('/hotel/amenities/', { city }, signal)
}

/* ------------------------------------------------------------------
   Display helpers — pure, no round trip
   ------------------------------------------------------------------ */

/**
 * Whole nights between two `YYYY-MM-DD` dates; always at least one.
 *
 * A stay is the nights slept, not the days touched: arriving Monday and
 * leaving Wednesday is two nights, which is also the range the backend holds
 * inventory on.
 */
export function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00`)
  const end = new Date(`${checkOut}T00:00:00`)
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
  return Number.isFinite(diff) && diff > 0 ? diff : 1
}

/**
 * India taxes stays at 12% below ₹7,500 a night and 18% at or above.
 *
 * The slab follows the nightly rate, not the total — three nights at ₹4,000
 * is ₹12,000 in all but is still taxed at 12%.
 */
export function taxRateFor(pricePerNight: number) {
  return pricePerNight >= 7500 ? 18 : 12
}

/* ------------------------------------------------------------------
   Inventory
   ------------------------------------------------------------------ */

/**
 * Stays in a city with something bookable for the whole date range.
 *
 * `roomsLeft` on each room is the tightest night of the stay: a room free on
 * three nights of four cannot take a four-night booking. A property with
 * nothing free for every night is not returned at all.
 */
export function searchStays(
  query: HotelSearchQuery,
  signal?: AbortSignal,
): Promise<Property[]> {
  return apiGet<Property[]>(
    '/hotel/stays/',
    {
      city: query.city,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guests,
    },
    signal,
  )
}

/** One property, for a reload or a link that skips the search. */
export function fetchStay(
  propertyId: string,
  checkIn: string,
  checkOut: string,
  signal?: AbortSignal,
): Promise<Property> {
  return apiGet<Property>(
    `/hotel/stays/${propertyId}/`,
    { checkIn, checkOut },
    signal,
  )
}

/* ------------------------------------------------------------------
   Fare
   ------------------------------------------------------------------ */

const PROPERTY_FEE_PER_NIGHT = 99

/**
 * Pure and synchronous, so the summary recalculates as rooms and dates change
 * without a round trip.
 *
 * The server recomputes on booking and its answer is what is charged;
 * `quoteStayFare` below is the authoritative version when it matters.
 */
export function calculateStayFare({
  ratePlan,
  nights,
  rooms,
}: {
  ratePlan: RatePlan | null
  nights: number
  rooms: number
}): HotelFareBreakdown {
  if (!ratePlan) {
    return {
      nights,
      rooms,
      roomTotal: 0,
      taxes: 0,
      taxRatePercent: 0,
      propertyFee: 0,
      total: 0,
    }
  }

  const roomTotal = ratePlan.pricePerNight * nights * rooms
  const taxRatePercent = taxRateFor(ratePlan.pricePerNight)
  const taxes = Math.round((roomTotal * taxRatePercent) / 100)
  const propertyFee = PROPERTY_FEE_PER_NIGHT * nights * rooms

  return {
    nights,
    rooms,
    roomTotal,
    taxes,
    taxRatePercent,
    propertyFee,
    total: roomTotal + taxes + propertyFee,
  }
}

export interface StayFareQuote extends HotelFareBreakdown {
  /** Rooms free across the whole stay right now. */
  roomsLeft: number
  /** False when fewer rooms are left than were asked for. */
  bookable: boolean
}

/** The server's own pricing, and whether the rooms are still there. */
export function quoteStayFare(
  {
    room,
    ratePlan,
    checkIn,
    checkOut,
    rooms,
  }: {
    room: RoomType
    ratePlan: RatePlan
    checkIn: string
    checkOut: string
    rooms: number
  },
  signal?: AbortSignal,
): Promise<StayFareQuote> {
  return apiPost<StayFareQuote>(
    '/hotel/quote/',
    {
      roomTypeId: room.id,
      ratePlanCode: ratePlan.id,
      checkIn,
      checkOut,
      rooms,
    },
    signal,
  )
}

/* ------------------------------------------------------------------
   Booking
   ------------------------------------------------------------------ */

export interface ConfirmStayInput {
  property: Property
  room: RoomType
  ratePlan: RatePlan
  query: HotelSearchQuery
  rooms: number
  guest: GuestDetails
}

/**
 * Makes the booking as `pending`, holding what it sells. Nothing is
 * charged here: `payForBooking` in `payment.services` takes the money
 * for the reference this returns and turns it `confirmed`.
 *
 * A stay is all or nothing: every night is checked before any is taken, so a
 * booking never leaves a guest holding three nights of four.
 *
 * Throws an `ApiError` with `code: 'rooms_unavailable'` and status 409 when
 * the rooms went while the guest was filling in the form; `detail.nights`
 * names which nights were short.
 */
export function confirmStay(
  input: ConfirmStayInput,
  signal?: AbortSignal,
): Promise<HotelBookingConfirmation> {
  return apiPost<HotelBookingConfirmation>(
    '/hotel/bookings/',
    {
      propertyId: input.property.id,
      roomTypeId: input.room.id,
      ratePlanCode: input.ratePlan.id,
      checkIn: input.query.checkIn,
      checkOut: input.query.checkOut,
      rooms: input.rooms,
      guests: input.query.guests,
      guest: input.guest,
    },
    signal,
  )
}

/** Looks a voucher up by its eight-character booking id. */
export function fetchStayBooking(
  bookingId: string,
  signal?: AbortSignal,
): Promise<HotelBookingConfirmation> {
  return apiGet<HotelBookingConfirmation>(
    `/hotel/bookings/${encodeURIComponent(bookingId)}/`,
    undefined,
    signal,
  )
}
