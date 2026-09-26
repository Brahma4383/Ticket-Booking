import { useEffect } from 'react'

import { BookingLayout, PaymentStep } from '@/components'
import { useCheckout, useStepHistory } from '@/hooks'
import { calculateStayFare, confirmStay } from '@/services/hotel.services'
import type { ConfirmStayInput } from '@/services/hotel.services'
import type { BookingStepMeta } from '@/types/common.types'
import type { HotelSearchQuery } from '@/types/hotel.types'

import { HotelFareSummary } from './HotelFareSummary'
import { StepConfirmation } from './StepConfirmation'
import { StepGuests } from './StepGuests'
import { StepRooms } from './StepRooms'
import { StepStays } from './StepStays'
import { HOTEL_STEP_ORDER, useHotelBooking } from './useHotelBooking'

const STEPS: BookingStepMeta[] = [
  { id: 'stays', label: 'Choose stay' },
  { id: 'rooms', label: 'Room & rate' },
  { id: 'guests', label: 'Guest details' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Voucher' },
]

const BACK_LABELS: Record<string, string> = {
  rooms: 'Back to stays',
  guests: 'Back to rooms',
  payment: 'Back to guest details',
}

/**
 * The stay booking wizard: stays -> room & rate -> guest details -> payment
 * -> voucher.
 *
 * Unlike the transport flows, the choice is two-level: a property, then a room
 * and the rate plan it is sold under — the plans differ on breakfast and
 * cancellation rather than on the room itself.
 *
 * The search has a URL — `App.tsx` routes it here and passes the query
 * string in as `query` — but the steps within the flow do not, so the
 * browser Back button returns to the search rather than stepping back a
 * step; every step has its own Back control.
 */
export function HotelBooking({
  query,
  onExit,
}: {
  query: HotelSearchQuery
  onExit: () => void
}) {
  const { state, actions, nights } = useHotelBooking(query)
  const { step, property, room, ratePlan, rooms, guest } = state

  // Each step gets its own history entry, so the browser's Back button
  // steps back through the flow instead of leaving it.
  useStepHistory({ step, order: HOTEL_STEP_ORDER, goTo: actions.goTo })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  // What the booking is made from; its JSON is the checkout's key, so a
  // change after a declined payment lets the held rooms go and books anew.
  const input: ConfirmStayInput | null =
    property && room && ratePlan
      ? { property, room, ratePlan, query: state.query, rooms, guest }
      : null

  const checkout = useCheckout('hotel', JSON.stringify(input), async () => {
    if (!input) throw new Error('Choose a room and rate first.')
    const booking = await confirmStay(input)
    return { reference: booking.bookingId, holdExpiresAt: booking.holdExpiresAt }
  })

  // A pay-at-hotel plan takes nothing online; the card or UPI is only the
  // guarantee. The server decides the same way.
  const amount = ratePlan?.payAtHotel
    ? 0
    : calculateStayFare({ ratePlan, nights, rooms }).total

  const summary = (
    <HotelFareSummary ratePlan={ratePlan} nights={nights} rooms={rooms} />
  )

  return (
    <BookingLayout
      steps={STEPS}
      activeId={step}
      onBack={
        step === 'stays' || step === 'confirmation' ? undefined : actions.back
      }
      backLabel={BACK_LABELS[step]}
      onExit={onExit}
    >
      {step === 'stays' ? (
        <StepStays
          query={state.query}
          nights={nights}
          onSelectProperty={actions.selectProperty}
          onModifySearch={onExit}
        />
      ) : null}

      {step === 'rooms' && property ? (
        <StepRooms
          property={property}
          nights={nights}
          rooms={rooms}
          guests={state.query.guests}
          selectedRoomId={room?.id ?? null}
          selectedPlanId={ratePlan?.id ?? null}
          onSelectPlan={actions.selectPlan}
          onRoomsChange={actions.setRooms}
          onContinue={() => actions.goTo('guests')}
          summaryPlan={ratePlan}
        />
      ) : null}

      {step === 'guests' && property && ratePlan ? (
        <StepGuests
          property={property}
          ratePlan={ratePlan}
          guest={guest}
          guests={state.query.guests}
          rooms={rooms}
          onChange={actions.updateGuest}
          onContinue={() => actions.goTo('payment')}
          summary={summary}
        />
      ) : null}

      {step === 'payment' ? (
        <PaymentStep
          mode="hotel"
          checkout={checkout}
          amount={amount}
          onPaid={actions.confirmed}
          summary={summary}
        />
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
