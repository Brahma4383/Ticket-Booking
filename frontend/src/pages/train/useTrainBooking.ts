import { useMemo, useReducer } from 'react'

import type {
  QuotaId,
  TrainBookingConfirmation,
  TrainClassOption,
  TrainContact,
  TrainPassenger,
  TrainSearchQuery,
  TrainStep,
  TrainTrip,
} from '@/types/train.types'

/** Indian Railways allows six passengers on one ticket (twelve without a berth). */
export const MAX_PASSENGERS = 6

export const TRAIN_STEP_ORDER: TrainStep[] = [
  'trains',
  'review',
  'passengers',
  'payment',
  'confirmation',
]

let passengerSeq = 0
function blankPassenger(): TrainPassenger {
  passengerSeq += 1
  return {
    id: `p${passengerSeq}`,
    name: '',
    age: '',
    gender: 'male',
    berth: 'no-preference',
  }
}

interface TrainBookingState {
  step: TrainStep
  query: TrainSearchQuery
  trip: TrainTrip | null
  classOption: TrainClassOption | null
  quota: QuotaId
  boardingCode: string
  passengers: TrainPassenger[]
  contact: TrainContact
  insured: boolean
  confirmation: TrainBookingConfirmation | null
}

type Action =
  | { type: 'setQuery'; query: TrainSearchQuery }
  | { type: 'selectClass'; trip: TrainTrip; classOption: TrainClassOption }
  | { type: 'changeClass'; classOption: TrainClassOption }
  | { type: 'setQuota'; quota: QuotaId }
  | { type: 'setBoarding'; code: string }
  | { type: 'addPassenger' }
  | { type: 'removePassenger'; id: string }
  | { type: 'updatePassenger'; id: string; patch: Partial<TrainPassenger> }
  | { type: 'updateContact'; patch: Partial<TrainContact> }
  | { type: 'setInsured'; insured: boolean }
  | { type: 'goTo'; step: TrainStep }
  | { type: 'back' }
  | { type: 'confirmed'; confirmation: TrainBookingConfirmation }

function createInitialState(query: TrainSearchQuery): TrainBookingState {
  return {
    step: 'trains',
    query,
    trip: null,
    classOption: null,
    quota: 'general',
    boardingCode: '',
    // Start with one row so the form is never empty.
    passengers: [blankPassenger()],
    contact: { email: '', phone: '' },
    insured: true,
    confirmation: null,
  }
}

function reducer(
  state: TrainBookingState,
  action: Action,
): TrainBookingState {
  switch (action.type) {
    case 'setQuery':
      // A different route or date invalidates everything downstream.
      return createInitialState(action.query)

    case 'selectClass':
      return {
        ...state,
        step: 'review',
        trip: action.trip,
        classOption: action.classOption,
        boardingCode: action.trip.boardingStations[0]?.code ?? '',
        // A ladies-quota booking is women-only, so default the first row.
        quota: state.quota,
      }

    case 'changeClass':
      // Swapping class on the review step keeps everything else intact.
      return { ...state, classOption: action.classOption }

    case 'setQuota': {
      const ladies = action.quota === 'ladies'
      return {
        ...state,
        quota: action.quota,
        passengers: state.passengers.map((passenger) =>
          ladies ? { ...passenger, gender: 'female' } : passenger,
        ),
      }
    }

    case 'setBoarding':
      return { ...state, boardingCode: action.code }

    case 'addPassenger':
      return state.passengers.length >= MAX_PASSENGERS
        ? state
        : {
            ...state,
            passengers: [
              ...state.passengers,
              state.quota === 'ladies'
                ? { ...blankPassenger(), gender: 'female' }
                : blankPassenger(),
            ],
          }

    case 'removePassenger':
      return state.passengers.length <= 1
        ? state
        : {
            ...state,
            passengers: state.passengers.filter(
              (passenger) => passenger.id !== action.id,
            ),
          }

    case 'updatePassenger':
      return {
        ...state,
        passengers: state.passengers.map((passenger) =>
          passenger.id === action.id
            ? { ...passenger, ...action.patch }
            : passenger,
        ),
      }

    case 'updateContact':
      return { ...state, contact: { ...state.contact, ...action.patch } }

    case 'setInsured':
      return { ...state, insured: action.insured }

    case 'goTo':
      return { ...state, step: action.step }

    case 'back': {
      const index = TRAIN_STEP_ORDER.indexOf(state.step)
      return index <= 0 ? state : { ...state, step: TRAIN_STEP_ORDER[index - 1] }
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

export function useTrainBooking(initialQuery: TrainSearchQuery) {
  const [state, dispatch] = useReducer(reducer, initialQuery, createInitialState)

  const actions = useMemo(
    () => ({
      setQuery: (query: TrainSearchQuery) =>
        dispatch({ type: 'setQuery', query }),
      selectClass: (trip: TrainTrip, classOption: TrainClassOption) =>
        dispatch({ type: 'selectClass', trip, classOption }),
      changeClass: (classOption: TrainClassOption) =>
        dispatch({ type: 'changeClass', classOption }),
      setQuota: (quota: QuotaId) => dispatch({ type: 'setQuota', quota }),
      setBoarding: (code: string) => dispatch({ type: 'setBoarding', code }),
      addPassenger: () => dispatch({ type: 'addPassenger' }),
      removePassenger: (id: string) =>
        dispatch({ type: 'removePassenger', id }),
      updatePassenger: (id: string, patch: Partial<TrainPassenger>) =>
        dispatch({ type: 'updatePassenger', id, patch }),
      updateContact: (patch: Partial<TrainContact>) =>
        dispatch({ type: 'updateContact', patch }),
      setInsured: (insured: boolean) =>
        dispatch({ type: 'setInsured', insured }),
      goTo: (step: TrainStep) => dispatch({ type: 'goTo', step }),
      back: () => dispatch({ type: 'back' }),
      confirmed: (confirmation: TrainBookingConfirmation) =>
        dispatch({ type: 'confirmed', confirmation }),
    }),
    [],
  )

  const boardingStation = useMemo(
    () =>
      state.trip?.boardingStations.find(
        (station) => station.code === state.boardingCode,
      ) ?? null,
    [state.trip, state.boardingCode],
  )

  return { state, actions, boardingStation }
}
