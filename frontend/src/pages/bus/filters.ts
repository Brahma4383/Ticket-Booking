import type { BusFilters, BusSort, BusTrip } from '@/types/bus.types'

export const COACH_TYPES = ['A/C', 'Non A/C', 'Sleeper', 'Seater']

export const DEPARTURE_WINDOWS = [
  { id: 'early', label: 'Before 6 am', from: 0, to: 359 },
  { id: 'morning', label: '6 am – 12 pm', from: 360, to: 719 },
  { id: 'afternoon', label: '12 pm – 6 pm', from: 720, to: 1079 },
  { id: 'night', label: 'After 6 pm', from: 1080, to: 1439 },
]

export const EMPTY_FILTERS: BusFilters = {
  coachTypes: [],
  departureWindows: [],
  operators: [],
}

export const SORT_LABELS: Record<BusSort, string> = {
  departure: 'Departure: earliest',
  'price-low': 'Price: low to high',
  'price-high': 'Price: high to low',
  rating: 'Rating: highest',
  duration: 'Duration: shortest',
}

export const SORT_OPTIONS = Object.values(SORT_LABELS)
export const SORT_IDS = Object.keys(SORT_LABELS) as BusSort[]

export function departureMinutes(trip: BusTrip) {
  const [hours, minutes] = trip.departure.split(':').map(Number)
  return hours * 60 + minutes
}

/** An empty selection means "no restriction", not "match nothing". */
export function matchesCoachType(trip: BusTrip, selected: string[]) {
  if (selected.length === 0) return true
  return selected.some((type) => {
    if (type === 'A/C') return trip.airConditioned
    if (type === 'Non A/C') return !trip.airConditioned
    if (type === 'Sleeper') return trip.kind === 'sleeper'
    return trip.kind === 'seater'
  })
}

export function applyFilters(trips: BusTrip[], filters: BusFilters) {
  return trips.filter((trip) => {
    if (!matchesCoachType(trip, filters.coachTypes)) return false

    if (filters.departureWindows.length > 0) {
      const minutes = departureMinutes(trip)
      const inWindow = filters.departureWindows.some((id) => {
        const window = DEPARTURE_WINDOWS.find((entry) => entry.id === id)
        return window ? minutes >= window.from && minutes <= window.to : false
      })
      if (!inWindow) return false
    }

    if (
      filters.operators.length > 0 &&
      !filters.operators.includes(trip.operator)
    ) {
      return false
    }

    return true
  })
}

export function sortTrips(trips: BusTrip[], sort: BusSort) {
  const copy = [...trips]
  switch (sort) {
    case 'price-low':
      return copy.sort((a, b) => a.fareFrom - b.fareFrom)
    case 'price-high':
      return copy.sort((a, b) => b.fareFrom - a.fareFrom)
    case 'rating':
      return copy.sort((a, b) => b.rating - a.rating)
    case 'duration':
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes)
    default:
      return copy.sort((a, b) => a.departure.localeCompare(b.departure))
  }
}

export function countActiveFilters(filters: BusFilters) {
  return (
    filters.coachTypes.length +
    filters.departureWindows.length +
    filters.operators.length
  )
}
