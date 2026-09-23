import { useEffect } from 'react'

import { BookingLayout, PaymentStep } from '@/components'
import { useStepHistory } from '@/hooks'
import { confirmBooking } from '@/services/bus.services'
import type { BookingStepMeta, PaymentMethodId } from '@/types/common.types'
import type { BusSearchQuery } from '@/types/bus.types'

import { FareSummary } from './FareSummary'
import { StepConfirmation } from './StepConfirmation'
import { StepPassengers } from './StepPassengers'
import { StepResults } from './StepResults'
import { StepSeats } from './StepSeats'
import { STEP_ORDER, useBooking } from './useBooking'

const STEPS: BookingStepMeta[] = [
  { id: 'results', label: 'Choose bus' },
  { id: 'seats', label: 'Select seats' },
  { id: 'passengers', label: 'Traveller details' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Ticket' },
]

const BACK_LABELS: Record<string, string> = {
  seats: 'Back to bus list',
  passengers: 'Back to seat selection',
  payment: 'Back to traveller details',
}

/**
 * The bus booking wizard: results -> seats -> travellers -> payment -> ticket.
 *
 * The search has a URL — `App.tsx` routes it here and passes the query
 * string in as `query` — but the steps within the flow do not, so the
 * browser Back button returns to the search rather than stepping back a
 * step; every step provides its own Back control.
 */
export function BusBooking({
  query,
  onExit,
}: {
  query: BusSearchQuery
  onExit: () => void
}) {
  const { state, actions, boardingPoint, droppingPoint } = useBooking(query)
  const { step, trip, seats, passengers, contact, confirmation } = state

  // Each step is a new page as far as the traveller is concerned.
  // Each step gets its own history entry, so the browser's Back button
  // steps back through the flow instead of leaving it.
  useStepHistory({ step, order: STEP_ORDER, goTo: actions.goTo })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  const handlePay = async (
    paymentMethod: string,
    paymentMethodId: PaymentMethodId,
  ) => {
    if (!trip || !boardingPoint || !droppingPoint) return

    const result = await confirmBooking({
      trip,
      query: state.query,
      seats,
      passengers,
      contact,
      boardingPoint,
      droppingPoint,
      paymentMethod,
      paymentMethodId,
    })

    actions.confirmed(result)
  }

  return (
    <BookingLayout
      steps={STEPS}
      activeId={step}
      onBack={
        step === 'results' || step === 'confirmation' ? undefined : actions.back
      }
      backLabel={BACK_LABELS[step]}
      onExit={onExit}
    >
      {step === 'results' ? (
        <StepResults
          query={state.query}
          onQueryChange={actions.setQuery}
          onSelectTrip={actions.selectTrip}
          onModifySearch={onExit}
        />
      ) : null}

      {step === 'seats' && trip ? (
        <StepSeats
          trip={trip}
          date={state.query.date}
          selectedSeats={seats}
          boardingPointId={state.boardingPointId}
          droppingPointId={state.droppingPointId}
          onToggleSeat={actions.toggleSeat}
          onBoardingChange={actions.setBoardingPoint}
          onDroppingChange={actions.setDroppingPoint}
          onContinue={() => actions.goTo('passengers')}
        />
      ) : null}

      {step === 'passengers' ? (
        <StepPassengers
          seats={seats}
          passengers={passengers}
          contact={contact}
          onPassengerChange={actions.updatePassenger}
          onContactChange={actions.updateContact}
          onContinue={() => actions.goTo('payment')}
          summary={<FareSummary seats={seats} />}
        />
      ) : null}

      {step === 'payment' ? (
        <PaymentStep onPay={handlePay} summary={<FareSummary seats={seats} />} />
      ) : null}

      {step === 'confirmation' && confirmation ? (
        <StepConfirmation
          booking={confirmation}
          onBookAnother={() => actions.setQuery(state.query)}
          onGoHome={onExit}
        />
      ) : null}
    </BookingLayout>
  )
}
