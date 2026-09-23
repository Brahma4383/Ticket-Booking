import { useMemo, useReducer } from 'react'

import { nightsBetween } from '@/services/hotel.services'
import type {
  GuestDetails,
  HotelBookingConfirmation,
  HotelSearchQuery,
  HotelStep,
  Property,
  RatePlan,
  RoomType,
} from '@/types/hotel.types'

/** Most properties cap a single booking at five rooms. */
export const MAX_ROOMS = 5

export const HOTEL_STEP_ORDER: HotelStep[] = [
  'stays',
  'rooms',
  'guests',
  'payment',
  'confirmation',
]

interface HotelBookingState {
  step: HotelStep
  query: HotelSearchQuery
  property: Property | null
  room: RoomType | null
  ratePlan: RatePlan | null
  rooms: number
  guest: GuestDetails
  confirmation: HotelBookingConfirmation | null
}

type Action =
  | { type: 'setQuery'; query: HotelSearchQuery }
  | { type: 'selectProperty'; property: Property }
  | { type: 'selectPlan'; room: RoomType; ratePlan: RatePlan }
  | { type: 'setRooms'; rooms: number }
  | { type: 'updateGuest'; patch: Partial<GuestDetails> }
  | { type: 'goTo'; step: HotelStep }
  | { type: 'back' }
  | { type: 'confirmed'; confirmation: HotelBookingConfirmation }

function createInitialState(query: HotelSearchQuery): HotelBookingState {
  return {
    step: 'stays',
    query,
    property: null,
    room: null,
    ratePlan: null,
    rooms: 1,
    guest: { name: '', email: '', phone: '', requests: '', arrival: '' },
    confirmation: null,
  }
}

function reducer(state: HotelBookingState, action: Action): HotelBookingState {
  switch (action.type) {
    case 'setQuery':
      // Different city or dates invalidates everything downstream.
      return createInitialState(action.query)

    case 'selectProperty':
      return {
        ...state,
        step: 'rooms',
        property: action.property,
        // Rates belong to the property, so a new one clears the choice.
        room: null,
        ratePlan: null,
      }

    case 'selectPlan':
      return { ...state, room: action.room, ratePlan: action.ratePlan }

    case 'setRooms':
      return {
        ...state,
        rooms: Math.min(Math.max(1, action.rooms), MAX_ROOMS),
      }

    case 'updateGuest':
      return { ...state, guest: { ...state.guest, ...action.patch } }

    case 'goTo':
      return { ...state, step: action.step }

    case 'back': {
      const index = HOTEL_STEP_ORDER.indexOf(state.step)
      return index <= 0 ? state : { ...state, step: HOTEL_STEP_ORDER[index - 1] }
    }

    case 'confirmed':
      return {
        ...state,
        step: 'confirmation',
        confirmation: action.confirmation,
      }

    default:
      return state
  }
}

export function useHotelBooking(initialQuery: HotelSearchQuery) {
  const [state, dispatch] = useReducer(reducer, initialQuery, createInitialState)

  const actions = useMemo(
    () => ({
      setQuery: (query: HotelSearchQuery) =>
        dispatch({ type: 'setQuery', query }),
      selectProperty: (property: Property) =>
        dispatch({ type: 'selectProperty', property }),
      selectPlan: (room: RoomType, ratePlan: RatePlan) =>
        dispatch({ type: 'selectPlan', room, ratePlan }),
      setRooms: (rooms: number) => dispatch({ type: 'setRooms', rooms }),
      updateGuest: (patch: Partial<GuestDetails>) =>
        dispatch({ type: 'updateGuest', patch }),
      goTo: (step: HotelStep) => dispatch({ type: 'goTo', step }),
      back: () => dispatch({ type: 'back' }),
      confirmed: (confirmation: HotelBookingConfirmation) =>
        dispatch({ type: 'confirmed', confirmation }),
    }),
    [],
  )

  const nights = useMemo(
    () => nightsBetween(state.query.checkIn, state.query.checkOut),
    [state.query.checkIn, state.query.checkOut],
  )

  return { state, actions, nights }
}
