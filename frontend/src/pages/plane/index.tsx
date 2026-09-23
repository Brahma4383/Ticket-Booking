import { useEffect } from 'react'

import { BookingLayout, PaymentStep } from '@/components'
import { useStepHistory } from '@/hooks'
import { confirmFlightBooking } from '@/services/plane.services'
import type { BookingStepMeta, PaymentMethodId } from '@/types/common.types'
import type { PlaneSearchQuery } from '@/types/plane.types'

import { PlaneFareSummary } from './PlaneFareSummary'
import { StepConfirmation } from './StepConfirmation'
import { StepFlights } from './StepFlights'
import { StepSeats } from './StepSeats'
import { StepTravellers } from './StepTravellers'
import { PLANE_STEP_ORDER, usePlaneBooking } from './usePlaneBooking'

const STEPS: BookingStepMeta[] = [
  { id: 'flights', label: 'Choose flight' },
  { id: 'travellers', label: 'Travellers' },
  { id: 'seats', label: 'Seats & add-ons' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Ticket' },
]

const BACK_LABELS: Record<string, string> = {
  travellers: 'Back to flight list',
  seats: 'Back to travellers',
  payment: 'Back to seats & add-ons',
}

/**
 * The flight booking wizard: flights -> travellers -> seats & add-ons ->
 * payment -> ticket.
 *
 * Travellers are named before seats so the cabin map can show who sits where.
 * Seat selection is optional; anyone without one is assigned a seat at
 * check-in, as the airline would.
 *
 * One-way only. The search has a URL — `App.tsx` routes it here and passes
 * the query string in as `query` — but the steps within the flow do not, so
 * the browser Back button returns to the search rather than stepping back a
 * step; every step has its own Back.
 */
export function PlaneBooking({
  query,
  onExit,
}: {
  query: PlaneSearchQuery
  onExit: () => void
}) {
  const { state, actions, seatTotal } = usePlaneBooking(query)
  const { step, trip, fareBrand, travellers, contact, addOns } = state

  // Each step gets its own history entry, so the browser's Back button
  // steps back through the flow instead of leaving it.
  useStepHistory({ step, order: PLANE_STEP_ORDER, goTo: actions.goTo })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  const handlePay = async (
    paymentMethod: string,
    paymentMethodId: PaymentMethodId,
  ) => {
    if (!trip || !fareBrand) return

    const result = await confirmFlightBooking({
      trip,
      query: state.query,
      fareBrand,
      travellers,
      seatByTraveller: Object.fromEntries(
        Object.entries(state.seatByTraveller).map(([id, seat]) => [id, seat.id]),
      ),
      addOns,
      contact,
      paymentMethod,
      paymentMethodId,
    })

    actions.confirmed(result)
  }

  const summary = (
    <PlaneFareSummary
      fareBrand={fareBrand}
      travellerCount={travellers.length}
      seatTotal={seatTotal}
      addOns={addOns}
    />
  )

  return (
    <BookingLayout
      steps={STEPS}
      activeId={step}
      onBack={
        step === 'flights' || step === 'confirmation' ? undefined : actions.back
      }
      backLabel={BACK_LABELS[step]}
      onExit={onExit}
    >
      {step === 'flights' ? (
        <StepFlights
          query={state.query}
          onQueryChange={actions.setQuery}
          onSelectFare={actions.selectFare}
          onModifySearch={onExit}
        />
      ) : null}

      {step === 'travellers' && trip && fareBrand ? (
        <StepTravellers
          trip={trip}
          travelDate={state.query.date}
          fareBrand={fareBrand}
          travellers={travellers}
          contact={contact}
          onAdd={actions.addTraveller}
          onRemove={actions.removeTraveller}
          onChange={actions.updateTraveller}
          onContactChange={actions.updateContact}
          onChangeFare={actions.changeFare}
          onContinue={() => actions.goTo('seats')}
          summary={summary}
        />
      ) : null}

      {step === 'seats' && trip && fareBrand ? (
        <StepSeats
          trip={trip}
          date={state.query.date}
          fareBrand={fareBrand}
          travellers={travellers}
          seatByTraveller={state.seatByTraveller}
          addOns={addOns}
          travellerCount={travellers.length}
          onAssignSeat={actions.assignSeat}
          onClearSeat={actions.clearSeat}
          onToggleAddOn={actions.toggleAddOn}
          onContinue={() => actions.goTo('payment')}
          summary={summary}
        />
      ) : null}

      {step === 'payment' ? (
        <PaymentStep onPay={handlePay} summary={summary} />
      ) : null}

      {step === 'confirmation' && state.confirmation ? (
        <StepConfirmation
          booking={state.confirmation}
          onBookAnother={() => actions.setQuery(state.query)}
          onGoHome={onExit}
        />
      ) : null}
    </BookingLayout>
  )
}
