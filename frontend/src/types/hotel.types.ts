export type HotelStep =
  | 'stays'
  | 'rooms'
  | 'guests'
  | 'payment'
  | 'confirmation'

export type PropertyType =
  | 'Hotel'
  | 'Resort'
  | 'Homestay'
  | 'Hostel'
  | 'Apartment'

export type BedType = 'Single' | 'Twin' | 'Double' | 'Queen' | 'King'

/**
 * A rate plan sells the same room under different terms. Free cancellation
 * and breakfast are what the guest is really choosing between.
 */
export interface RatePlan {
  id: string
  name: string
  pricePerNight: number
  breakfastIncluded: boolean
  freeCancellation: boolean
  /** Human-readable terms, shown under the plan. */
  cancellationNote: string
  /** Settle at the property instead of now. */
  payAtHotel: boolean
}

export interface RoomType {
  id: string
  name: string
  sizeSqft: number
  bed: BedType
  maxGuests: number
  amenities: string[]
  roomsLeft: number
  ratePlans: RatePlan[]
}

export interface Property {
  id: string
  name: string
  type: PropertyType
  /** 1–5; hostels and homestays often have none, shown as 0. */
  starRating: number
  locality: string
  city: string
  distanceKm: number
  /** Out of 10, the usual convention for stays. */
  reviewScore: number
  reviewCount: number
  amenities: string[]
  /** Lowest nightly rate across all rooms and plans. */
  fromPricePerNight: number
  /** Tailwind gradient stops standing in for a photo. */
  imageAccent: string
  checkInTime: string
  checkOutTime: string
  rooms: RoomType[]
}

export interface HotelSearchQuery {
  city: string
  /** `YYYY-MM-DD`. */
  checkIn: string
  checkOut: string
  guests: number
}

export type HotelSort =
  | 'popular'
  | 'price-low'
  | 'price-high'
  | 'rating'
  | 'distance'

export interface HotelFilters {
  types: PropertyType[]
  /** Star ratings to include; empty means any. */
  stars: number[]
  amenities: string[]
  /** Only stays whose cheapest plan cancels free. */
  freeCancellationOnly: boolean
  maxPricePerNight: number | null
}

export interface GuestDetails {
  name: string
  email: string
  phone: string
  /** Free text passed to the property. */
  requests: string
  /** Rough arrival time, so the desk can hold the room. */
  arrival: string
}

export interface HotelFareBreakdown {
  nights: number
  rooms: number
  /** pricePerNight x nights x rooms. */
  roomTotal: number
  /** 12% below ₹7,500 a night, 18% at or above — the Indian slab. */
  taxes: number
  taxRatePercent: number
  propertyFee: number
  total: number
}

export interface HotelBookingConfirmation {
  /** Eight-character property booking id. */
  bookingId: string
  bookedAt: string
  property: Property
  room: RoomType
  ratePlan: RatePlan
  query: HotelSearchQuery
  rooms: number
  guest: GuestDetails
  fare: HotelFareBreakdown
  paymentMethod: string
}
