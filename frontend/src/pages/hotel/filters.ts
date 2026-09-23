import { HOTEL_AMENITIES, PROPERTY_TYPES } from '@/services/hotel.services'
import type {
  HotelFilters,
  HotelSort,
  Property,
} from '@/types/hotel.types'

export { HOTEL_AMENITIES, PROPERTY_TYPES }

export const STAR_OPTIONS = [5, 4, 3, 2]

export const EMPTY_HOTEL_FILTERS: HotelFilters = {
  types: [],
  stars: [],
  amenities: [],
  freeCancellationOnly: false,
  maxPricePerNight: null,
}

export const HOTEL_SORT_LABELS: Record<HotelSort, string> = {
  popular: 'Most popular',
  'price-low': 'Price: low to high',
  'price-high': 'Price: high to low',
  rating: 'Guest rating: highest',
  distance: 'Distance from centre',
}

export const HOTEL_SORT_OPTIONS = Object.values(HOTEL_SORT_LABELS)
export const HOTEL_SORT_IDS = Object.keys(HOTEL_SORT_LABELS) as HotelSort[]

/** True when any plan on any room cancels free. */
export const hasFreeCancellation = (property: Property) =>
  property.rooms.some((room) =>
    room.ratePlans.some((plan) => plan.freeCancellation),
  )

export function applyHotelFilters(
  properties: Property[],
  filters: HotelFilters,
) {
  return properties.filter((property) => {
    if (filters.types.length > 0 && !filters.types.includes(property.type)) {
      return false
    }

    // Unrated stays (hostels, homestays) drop out once stars are demanded.
    if (filters.stars.length > 0 && !filters.stars.includes(property.starRating)) {
      return false
    }

    if (
      filters.amenities.length > 0 &&
      !filters.amenities.every((amenity) =>
        property.amenities.includes(amenity),
      )
    ) {
      return false
    }

    if (filters.freeCancellationOnly && !hasFreeCancellation(property)) {
      return false
    }

    if (
      filters.maxPricePerNight !== null &&
      property.fromPricePerNight > filters.maxPricePerNight
    ) {
      return false
    }

    return true
  })
}

export function sortProperties(properties: Property[], sort: HotelSort) {
  const copy = [...properties]
  switch (sort) {
    case 'price-low':
      return copy.sort((a, b) => a.fromPricePerNight - b.fromPricePerNight)
    case 'price-high':
      return copy.sort((a, b) => b.fromPricePerNight - a.fromPricePerNight)
    case 'rating':
      return copy.sort((a, b) => b.reviewScore - a.reviewScore)
    case 'distance':
      return copy.sort((a, b) => a.distanceKm - b.distanceKm)
    default:
      // Popularity blends the score with how many people rated it.
      return copy.sort(
        (a, b) =>
          b.reviewScore * Math.log10(b.reviewCount + 10) -
          a.reviewScore * Math.log10(a.reviewCount + 10),
      )
  }
}

export function countActiveHotelFilters(filters: HotelFilters) {
  return (
    filters.types.length +
    filters.stars.length +
    filters.amenities.length +
    (filters.freeCancellationOnly ? 1 : 0) +
    (filters.maxPricePerNight !== null ? 1 : 0)
  )
}
