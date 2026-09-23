import { useMemo, useReducer } from 'react'

import type {
  AddOnId,
  CabinSeat,
  FareBrand,
  FlightContact,
  FlightTraveller,
  FlightTrip,
  PlaneBookingConfirmation,
  PlaneSearchQuery,
  PlaneStep,
  TravellerType,
} from '@/types/plane.types'

/** Airlines cap a single booking at nine travellers. */
export const MAX_TRAVELLERS = 9

export const PLANE_STEP_ORDER: PlaneStep[] = [
  'flights',
  'travellers',
  'seats',
  'payment',
  'confirmation',
]

/** Infants travel on a lap, so they are never given a seat. */
export const takesSeat = (traveller: FlightTraveller) =>
  traveller.type !== 'infant'

let travellerSeq = 0
function blankTraveller(type: TravellerType = 'adult'): FlightTraveller {
  travellerSeq += 1
  return {
    id: `t${travellerSeq}`,
    type,
    title: type === 'adult' ? 'Mr' : 'Master',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
  }
}

interface PlaneBookingState {
  step: PlaneStep
  query: PlaneSearchQuery
  trip: FlightTrip | null
  fareBrand: FareBrand | null
  travellers: FlightTraveller[]
  contact: FlightContact
  /** Traveller id -> seat. Seats are assigned one traveller at a time. */
  seatByTraveller: Record<string, CabinSeat>
  addOns: AddOnId[]
  confirmation: PlaneBookingConfirmation | null
}

type Action =
  | { type: 'setQuery'; query: PlaneSearchQuery }
  | { type: 'selectFare'; trip: FlightTrip; fareBrand: FareBrand }
  | { type: 'changeFare'; fareBrand: FareBrand }
  | { type: 'addTraveller'; travellerType: TravellerType }
  | { type: 'removeTraveller'; id: string }
  | { type: 'updateTraveller'; id: string; patch: Partial<FlightTraveller> }
  | { type: 'updateContact'; patch: Partial<FlightContact> }
  | { type: 'assignSeat'; travellerId: string; seat: CabinSeat }
  | { type: 'clearSeat'; travellerId: string }
  | { type: 'toggleAddOn'; addOn: AddOnId }
  | { type: 'goTo'; step: PlaneStep }
  | { type: 'back' }
  | { type: 'confirmed'; confirmation: PlaneBookingConfirmation }

function createInitialState(query: PlaneSearchQuery): PlaneBookingState {
  const count = Math.min(Math.max(1, query.travellers), MAX_TRAVELLERS)
  return {
    step: 'flights',
    query,
    trip: null,
    fareBrand: null,
    // Seeded from the home search panel's travellers field.
    travellers: Array.from({ length: count }, () => blankTraveller('adult')),
    contact: { email: '', phone: '' },
    seatByTraveller: {},
    addOns: [],
    confirmation: null,
  }
}

function withoutSeat(
  seats: Record<string, CabinSeat>,
  travellerId: string,
): Record<string, CabinSeat> {
  const next = { ...seats }
  delete next[travellerId]
  return next
}

function reducer(
  state: PlaneBookingState,
  action: Action,
): PlaneBookingState {
  switch (action.type) {
    case 'setQuery':
      // A different route or date invalidates everything downstream.
      return createInitialState(action.query)

    case 'selectFare':
      return {
        ...state,
        step: 'travellers',
        trip: action.trip,
        fareBrand: action.fareBrand,
        // The cabin map belongs to the flight, so seats cannot carry over.
        seatByTraveller: {},
      }

    case 'changeFare':
      return { ...state, fareBrand: action.fareBrand }

    case 'addTraveller':
      return state.travellers.length >= MAX_TRAVELLERS
        ? state
        : {
            ...state,
            travellers: [
              ...state.travellers,
              blankTraveller(action.travellerType),
            ],
          }

    case 'removeTraveller':
      return state.travellers.length <= 1
        ? state
        : {
            ...state,
            travellers: state.travellers.filter(
              (traveller) => traveller.id !== action.id,
            ),
            seatByTraveller: withoutSeat(state.seatByTraveller, action.id),
          }

    case 'updateTraveller': {
      const travellers = state.travellers.map((traveller) =>
        traveller.id === action.id
          ? { ...traveller, ...action.patch }
          : traveller,
      )
      // Turning someone into an infant gives up their seat.
      const becameInfant = action.patch.type === 'infant'
      return {
        ...state,
        travellers,
        seatByTraveller: becameInfant
          ? withoutSeat(state.seatByTraveller, action.id)
          : state.seatByTraveller,
      }
    }

    case 'updateContact':
      return { ...state, contact: { ...state.contact, ...action.patch } }

    case 'assignSeat': {
      // A seat belongs to one traveller: take it off whoever had it.
      const freed = Object.fromEntries(
        Object.entries(state.seatByTraveller).filter(
          ([, seat]) => seat.id !== action.seat.id,
        ),
      )
      return {
        ...state,
        seatByTraveller: { ...freed, [action.travellerId]: action.seat },
      }
    }

    case 'clearSeat':
      return {
        ...state,
        seatByTraveller: withoutSeat(state.seatByTraveller, action.travellerId),
      }

    case 'toggleAddOn':
      return {
        ...state,
        addOns: state.addOns.includes(action.addOn)
          ? state.addOns.filter((entry) => entry !== action.addOn)
          : [...state.addOns, action.addOn],
      }

    case 'goTo':
      return { ...state, step: action.step }

    case 'back': {
      const index = PLANE_STEP_ORDER.indexOf(state.step)
      return index <= 0 ? state : { ...state, step: PLANE_STEP_ORDER[index - 1] }
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

export function usePlaneBooking(initialQuery: PlaneSearchQuery) {
  const [state, dispatch] = useReducer(reducer, initialQuery, createInitialState)

  const actions = useMemo(
    () => ({
      setQuery: (query: PlaneSearchQuery) =>
        dispatch({ type: 'setQuery', query }),
      selectFare: (trip: FlightTrip, fareBrand: FareBrand) =>
        dispatch({ type: 'selectFare', trip, fareBrand }),
      changeFare: (fareBrand: FareBrand) =>
        dispatch({ type: 'changeFare', fareBrand }),
      addTraveller: (travellerType: TravellerType) =>
        dispatch({ type: 'addTraveller', travellerType }),
      removeTraveller: (id: string) =>
        dispatch({ type: 'removeTraveller', id }),
      updateTraveller: (id: string, patch: Partial<FlightTraveller>) =>
        dispatch({ type: 'updateTraveller', id, patch }),
      updateContact: (patch: Partial<FlightContact>) =>
        dispatch({ type: 'updateContact', patch }),
      assignSeat: (travellerId: string, seat: CabinSeat) =>
        dispatch({ type: 'assignSeat', travellerId, seat }),
      clearSeat: (travellerId: string) =>
        dispatch({ type: 'clearSeat', travellerId }),
      toggleAddOn: (addOn: AddOnId) => dispatch({ type: 'toggleAddOn', addOn }),
      goTo: (step: PlaneStep) => dispatch({ type: 'goTo', step }),
      back: () => dispatch({ type: 'back' }),
      confirmed: (confirmation: PlaneBookingConfirmation) =>
        dispatch({ type: 'confirmed', confirmation }),
    }),
    [],
  )

  const seatTotal = useMemo(
    () =>
      Object.values(state.seatByTraveller).reduce(
        (total, seat) => total + seat.price,
        0,
      ),
    [state.seatByTraveller],
  )

  return { state, actions, seatTotal }
}
