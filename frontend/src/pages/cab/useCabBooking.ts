import { useEffect, useMemo, useReducer, useState } from 'react'

import { estimateTrip } from '@/services/cab.services'
import type {
  CabBookingConfirmation,
  CabExtraId,
  CabOption,
  CabSearchQuery,
  CabStep,
  CabTripDetails,
  TripEstimate,
} from '@/types/cab.types'

export const CAB_STEP_ORDER: CabStep[] = [
  'cabs',
  'details',
  'payment',
  'confirmation',
]

interface CabBookingState {
  step: CabStep
  query: CabSearchQuery
  option: CabOption | null
  extras: CabExtraId[]
  details: CabTripDetails
  confirmation: CabBookingConfirmation | null
}

type Action =
  | { type: 'setQuery'; query: CabSearchQuery }
  | { type: 'selectOption'; option: CabOption }
  | { type: 'toggleExtra'; extra: CabExtraId }
  | { type: 'updateDetails'; patch: Partial<CabTripDetails> }
  | { type: 'goTo'; step: CabStep }
  | { type: 'back' }
  | { type: 'confirmed'; confirmation: CabBookingConfirmation }

function createInitialState(query: CabSearchQuery): CabBookingState {
  return {
    step: 'cabs',
    query,
    option: null,
    extras: [],
    details: {
      // Seeded from the search so the traveller only adds the house number.
      pickupAddress: query.pickup,
      dropAddress: query.drop,
      date: query.date,
      time: query.time,
      name: '',
      phone: '',
      email: '',
    },
    confirmation: null,
  }
}

function reducer(state: CabBookingState, action: Action): CabBookingState {
  switch (action.type) {
    case 'setQuery':
      // A different route invalidates the fare, so start over.
      return createInitialState(action.query)

    case 'selectOption':
      return { ...state, step: 'details', option: action.option }

    case 'toggleExtra':
      return {
        ...state,
        extras: state.extras.includes(action.extra)
          ? state.extras.filter((entry) => entry !== action.extra)
          : [...state.extras, action.extra],
      }

    case 'updateDetails': {
      const details = { ...state.details, ...action.patch }
      return {
        ...state,
        details,
        // Keep the query in step, so the estimate reflects a changed time.
        query: {
          ...state.query,
          date: details.date,
          time: details.time,
        },
      }
    }

    case 'goTo':
      return { ...state, step: action.step }

    case 'back': {
      const index = CAB_STEP_ORDER.indexOf(state.step)
      return index <= 0 ? state : { ...state, step: CAB_STEP_ORDER[index - 1] }
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

export function useCabBooking(initialQuery: CabSearchQuery) {
  const [state, dispatch] = useReducer(reducer, initialQuery, createInitialState)

  const actions = useMemo(
    () => ({
      setQuery: (query: CabSearchQuery) => dispatch({ type: 'setQuery', query }),
      selectOption: (option: CabOption) =>
        dispatch({ type: 'selectOption', option }),
      toggleExtra: (extra: CabExtraId) =>
        dispatch({ type: 'toggleExtra', extra }),
      updateDetails: (patch: Partial<CabTripDetails>) =>
        dispatch({ type: 'updateDetails', patch }),
      goTo: (step: CabStep) => dispatch({ type: 'goTo', step }),
      back: () => dispatch({ type: 'back' }),
      confirmed: (confirmation: CabBookingConfirmation) =>
        dispatch({ type: 'confirmed', confirmation }),
    }),
    [],
  )

  // Distance, duration, trip type and the night flag all come from the
  // server: each of them moves the fare, so none of them is the client's to
  // decide. It re-runs as the traveller edits the pickup time on the details
  // step, which is what turns the night allowance on and off.
  const [estimate, setEstimate] = useState<TripEstimate | null>(null)
  const { pickup, drop, date, time } = state.query

  useEffect(() => {
    const controller = new AbortController()

    estimateTrip({ pickup, drop, date, time }, controller.signal)
      .then(setEstimate)
      // A failed estimate leaves the trip figures dashed out rather than
      // taking the step down; the fare summary reads zero until it arrives.
      .catch(() => {})

    return () => controller.abort()
  }, [pickup, drop, date, time])

  return { state, actions, estimate }
}
