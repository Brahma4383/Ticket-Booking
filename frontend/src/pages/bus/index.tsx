import { useEffect } from 'react'

import { BookingLayout, PaymentStep } from '@/components'
import { useCheckout, useStepHistory } from '@/hooks'
import { calculateFare, confirmBooking } from '@/services/bus.services'
import type { ConfirmBookingInput } from '@/services/bus.services'
import type { BookingStepMeta } from '@/types/common.types'
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

  // What the booking is made from. Its JSON is the checkout's key: change a
  // seat or a name after a declined payment and the held booking is let go
  // and a new one made, rather than paying for the old selection.
  const input: ConfirmBookingInput | null =
    trip && boardingPoint && droppingPoint
      ? {
          trip,
          query: state.query,
          seats,
          passengers,
          contact,
          boardingPoint,
          droppingPoint,
        }
      : null

  const checkout = useCheckout('bus', JSON.stringify(input), async () => {
    if (!input) throw new Error('Choose a bus and seats first.')
    const booking = await confirmBooking(input)
    return { reference: booking.pnr, holdExpiresAt: booking.holdExpiresAt }
  })

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
        <PaymentStep
          mode="bus"
          checkout={checkout}
          amount={calculateFare(seats).total}
          onPaid={actions.confirmed}
          summary={<FareSummary seats={seats} />}
        />
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
