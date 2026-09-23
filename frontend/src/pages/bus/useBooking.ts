import { useCallback, useMemo, useReducer } from 'react'

import type {
  BookingConfirmation,
  BookingStep,
  BusSearchQuery,
  BusTrip,
  ContactDetails,
  Passenger,
  Seat,
} from '@/types/bus.types'

/** Operators cap a single booking; six is the common limit. */
export const MAX_SEATS = 6

export const STEP_ORDER: BookingStep[] = [
  'results',
  'seats',
  'passengers',
  'payment',
  'confirmation',
]

interface BookingState {
  step: BookingStep
  query: BusSearchQuery
  trip: BusTrip | null
  seats: Seat[]
  boardingPointId: string
  droppingPointId: string
  passengers: Passenger[]
  contact: ContactDetails
  confirmation: BookingConfirmation | null
}

type Action =
  | { type: 'setQuery'; query: BusSearchQuery }
  | { type: 'selectTrip'; trip: BusTrip }
  | { type: 'toggleSeat'; seat: Seat }
  | { type: 'setBoardingPoint'; id: string }
  | { type: 'setDroppingPoint'; id: string }
  | { type: 'updatePassenger'; seatId: string; patch: Partial<Passenger> }
  | { type: 'updateContact'; patch: Partial<ContactDetails> }
  | { type: 'goTo'; step: BookingStep }
  | { type: 'back' }
  | { type: 'confirmed'; confirmation: BookingConfirmation }

/**
 * Passengers are derived from the chosen seats: one row per seat, in the order
 * the seats were picked. Details already typed in are carried over, so
 * deselecting one seat never wipes another passenger's name.
 */
function syncPassengers(seats: Seat[], existing: Passenger[]): Passenger[] {
  return seats.map((seat) => {
    const previous = existing.find((passenger) => passenger.seatId === seat.id)
    return (
      previous ?? {
        seatId: seat.id,
        name: '',
        age: '',
        // A ladies seat can only be occupied by a female passenger.
        gender: seat.status === 'ladies' ? 'female' : 'male',
      }
    )
  })
}

function createInitialState(query: BusSearchQuery): BookingState {
  return {
    step: 'results',
    query,
    trip: null,
    seats: [],
    boardingPointId: '',
    droppingPointId: '',
    passengers: [],
    contact: { email: '', phone: '' },
    confirmation: null,
  }
}

function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case 'setQuery':
      // A different route or date invalidates everything downstream.
      return { ...createInitialState(action.query) }

    case 'selectTrip':
      return {
        ...state,
        step: 'seats',
        trip: action.trip,
        seats: [],
        passengers: [],
        boardingPointId: action.trip.boardingPoints[0]?.id ?? '',
        droppingPointId: action.trip.droppingPoints[0]?.id ?? '',
      }

    case 'toggleSeat': {
      const alreadyPicked = state.seats.some(
        (seat) => seat.id === action.seat.id,
      )
      if (!alreadyPicked && state.seats.length >= MAX_SEATS) return state

      const seats = alreadyPicked
        ? state.seats.filter((seat) => seat.id !== action.seat.id)
        : [...state.seats, action.seat]

      return { ...state, seats, passengers: syncPassengers(seats, state.passengers) }
    }

    case 'setBoardingPoint':
      return { ...state, boardingPointId: action.id }

    case 'setDroppingPoint':
      return { ...state, droppingPointId: action.id }

    case 'updatePassenger':
      return {
        ...state,
        passengers: state.passengers.map((passenger) =>
          passenger.seatId === action.seatId
            ? { ...passenger, ...action.patch }
            : passenger,
        ),
      }

    case 'updateContact':
      return { ...state, contact: { ...state.contact, ...action.patch } }

    case 'goTo':
      return { ...state, step: action.step }

    case 'back': {
      const index = STEP_ORDER.indexOf(state.step)
      return index <= 0 ? state : { ...state, step: STEP_ORDER[index - 1] }
    }

    case 'confirmed':
      return { ...state, step: 'confirmation', confirmation: action.confirmation }

    default:
      return state
  }
}

export function useBooking(initialQuery: BusSearchQuery) {
  const [state, dispatch] = useReducer(reducer, initialQuery, createInitialState)

  const actions = useMemo(
    () => ({
      setQuery: (query: BusSearchQuery) => dispatch({ type: 'setQuery', query }),
      selectTrip: (trip: BusTrip) => dispatch({ type: 'selectTrip', trip }),
      toggleSeat: (seat: Seat) => dispatch({ type: 'toggleSeat', seat }),
      setBoardingPoint: (id: string) => dispatch({ type: 'setBoardingPoint', id }),
      setDroppingPoint: (id: string) => dispatch({ type: 'setDroppingPoint', id }),
      updatePassenger: (seatId: string, patch: Partial<Passenger>) =>
        dispatch({ type: 'updatePassenger', seatId, patch }),
      updateContact: (patch: Partial<ContactDetails>) =>
        dispatch({ type: 'updateContact', patch }),
      goTo: (step: BookingStep) => dispatch({ type: 'goTo', step }),
      back: () => dispatch({ type: 'back' }),
      confirmed: (confirmation: BookingConfirmation) =>
        dispatch({ type: 'confirmed', confirmation }),
    }),
    [],
  )

  const boardingPoint = useMemo(
    () =>
      state.trip?.boardingPoints.find(
        (point) => point.id === state.boardingPointId,
      ) ?? null,
    [state.trip, state.boardingPointId],
  )

  const droppingPoint = useMemo(
    () =>
      state.trip?.droppingPoints.find(
        (point) => point.id === state.droppingPointId,
      ) ?? null,
    [state.trip, state.droppingPointId],
  )

  const reset = useCallback(
    (query: BusSearchQuery) => dispatch({ type: 'setQuery', query }),
    [],
  )

  return { state, actions, boardingPoint, droppingPoint, reset }
}
