import { CLASS_LABELS, clockToMinutes } from '@/services/train.services'
import type {
  TrainClassCode,
  TrainFilters,
  TrainSort,
  TrainTrip,
} from '@/types/train.types'

export const CLASS_CODES = Object.keys(CLASS_LABELS) as TrainClassCode[]

export const DEPARTURE_WINDOWS = [
  { id: 'early', label: 'Before 6 am', from: 0, to: 359 },
  { id: 'morning', label: '6 am – 12 pm', from: 360, to: 719 },
  { id: 'afternoon', label: '12 pm – 6 pm', from: 720, to: 1079 },
  { id: 'night', label: 'After 6 pm', from: 1080, to: 1439 },
]

export const EMPTY_TRAIN_FILTERS: TrainFilters = {
  classes: [],
  departureWindows: [],
  availableOnly: false,
}

export const TRAIN_SORT_LABELS: Record<TrainSort, string> = {
  departure: 'Departure: earliest',
  arrival: 'Arrival: earliest',
  duration: 'Duration: shortest',
  'price-low': 'Fare: low to high',
  availability: 'Availability: best first',
}

export const TRAIN_SORT_OPTIONS = Object.values(TRAIN_SORT_LABELS)
export const TRAIN_SORT_IDS = Object.keys(TRAIN_SORT_LABELS) as TrainSort[]

export const hasSeats = (trip: TrainTrip) =>
  trip.classes.some((option) => option.availability.kind === 'available')

/** Cheapest fare on the train, used for price sorting. */
export const lowestFare = (trip: TrainTrip) =>
  Math.min(...trip.classes.map((option) => option.fare))

/** Ranks trains by how good their best class is: confirmed > RAC > waitlist. */
const availabilityRank = (trip: TrainTrip) => {
  const order = { available: 0, rac: 1, waitlist: 2, unavailable: 3 }
  return Math.min(...trip.classes.map((o) => order[o.availability.kind]))
}

export function applyTrainFilters(trips: TrainTrip[], filters: TrainFilters) {
  return trips.filter((trip) => {
    if (filters.availableOnly && !hasSeats(trip)) return false

    if (
      filters.classes.length > 0 &&
      !trip.classes.some((option) => filters.classes.includes(option.code))
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

export function sortTrains(trips: TrainTrip[], sort: TrainSort) {
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
    case 'availability':
      return copy.sort((a, b) => availabilityRank(a) - availabilityRank(b))
    default:
      return copy.sort(
        (a, b) => clockToMinutes(a.departure) - clockToMinutes(b.departure),
      )
  }
}

export function countActiveTrainFilters(filters: TrainFilters) {
  return (
    filters.classes.length +
    filters.departureWindows.length +
    (filters.availableOnly ? 1 : 0)
  )
}
