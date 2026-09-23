import { clockToMinutes } from '@/services/plane.services'
import type { FlightTrip, PlaneFilters, PlaneSort } from '@/types/plane.types'

export const DEPARTURE_WINDOWS = [
  { id: 'early', label: 'Before 6 am', from: 0, to: 359 },
  { id: 'morning', label: '6 am – 12 pm', from: 360, to: 719 },
  { id: 'afternoon', label: '12 pm – 6 pm', from: 720, to: 1079 },
  { id: 'night', label: 'After 6 pm', from: 1080, to: 1439 },
]

export const STOP_OPTIONS = [
  { value: 0, label: 'Non-stop' },
  { value: 1, label: '1 stop' },
  { value: 2, label: '2+ stops' },
]

export const EMPTY_PLANE_FILTERS: PlaneFilters = {
  stops: [],
  airlines: [],
  departureWindows: [],
  nonStopOnly: false,
}

export const PLANE_SORT_LABELS: Record<PlaneSort, string> = {
  departure: 'Departure: earliest',
  arrival: 'Arrival: earliest',
  duration: 'Duration: shortest',
  'price-low': 'Price: low to high',
  stops: 'Stops: fewest',
}

export const PLANE_SORT_OPTIONS = Object.values(PLANE_SORT_LABELS)
export const PLANE_SORT_IDS = Object.keys(PLANE_SORT_LABELS) as PlaneSort[]

/** Cheapest fare brand on the flight, used for price sorting. */
export const lowestFare = (trip: FlightTrip) =>
  Math.min(...trip.fares.map((fare) => fare.price))

/** Two or more stops all count as the "2+" bucket. */
const stopBucket = (trip: FlightTrip) => Math.min(trip.stops.length, 2)

export function applyPlaneFilters(trips: FlightTrip[], filters: PlaneFilters) {
  return trips.filter((trip) => {
    if (filters.nonStopOnly && trip.stops.length > 0) return false

    if (
      filters.stops.length > 0 &&
      !filters.stops.includes(stopBucket(trip))
    ) {
      return false
    }

    if (
      filters.airlines.length > 0 &&
      !filters.airlines.includes(trip.airline)
    ) {
      return false
    }

    if (filters.departureWindows.length > 0) {
      const minutes = clockToMinutes(trip.departure)
      const inWindow = filters.departureWindows.some((id) => {
        const window = DEPARTURE_WINDOWS.find((entry) => entry.id === id)
        return window ? minutes >= window.from && minutes <= window.to : false
      })
      if (!inWindow) return false
    }

    return true
  })
}

export function sortFlights(trips: FlightTrip[], sort: PlaneSort) {
  const copy = [...trips]
  switch (sort) {
    case 'arrival':
      return copy.sort(
        (a, b) => clockToMinutes(a.arrival) - clockToMinutes(b.arrival),
      )
    case 'duration':
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes)
    case 'price-low':
      return copy.sort((a, b) => lowestFare(a) - lowestFare(b))
    case 'stops':
      return copy.sort((a, b) => a.stops.length - b.stops.length)
    default:
      return copy.sort(
        (a, b) => clockToMinutes(a.departure) - clockToMinutes(b.departure),
      )
  }
}

export function countActivePlaneFilters(filters: PlaneFilters) {
  return (
    filters.stops.length +
    filters.airlines.length +
    filters.departureWindows.length +
    (filters.nonStopOnly ? 1 : 0)
  )
}
