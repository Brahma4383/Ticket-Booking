import { useEffect } from 'react'

import { BookingLayout, PaymentStep } from '@/components'
import { useStepHistory } from '@/hooks'
import { confirmCab } from '@/services/cab.services'
import type { CabSearchQuery } from '@/types/cab.types'
import type { BookingStepMeta, PaymentMethodId } from '@/types/common.types'

import { CabFareSummary } from './CabFareSummary'
import { StepCabs } from './StepCabs'
import { StepConfirmation } from './StepConfirmation'
import { StepDetails } from './StepDetails'
import { CAB_STEP_ORDER, useCabBooking } from './useCabBooking'

const STEPS: BookingStepMeta[] = [
  { id: 'cabs', label: 'Choose cab' },
  { id: 'details', label: 'Trip details' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Booking' },
]

const BACK_LABELS: Record<string, string> = {
  details: 'Back to cab list',
  payment: 'Back to trip details',
}

/**
 * The cab booking wizard: cabs -> trip details -> payment -> booking.
 *
 * Four steps rather than five: there is no seat or room to choose, and the
 * fare is split — a 20% advance online, the balance paid to the driver — which
 * is how outstation cabs are normally sold here.
 *
 * The search has a URL — `App.tsx` routes it here and passes the query
 * string in as `query` — but the steps within the flow do not, so the
 * browser Back button returns to the search rather than stepping back a
 * step; every step has its own Back control.
 */
export function CabBooking({
  query,
  onExit,
}: {
  query: CabSearchQuery
  onExit: () => void
}) {
  const { state, actions, estimate } = useCabBooking(query)
  const { step, option, extras, details } = state

  // Each step gets its own history entry, so the browser's Back button
  // steps back through the flow instead of leaving it.
  useStepHistory({ step, order: CAB_STEP_ORDER, goTo: actions.goTo })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  const handlePay = async (
    paymentMethod: string,
    paymentMethodId: PaymentMethodId,
  ) => {
    if (!option) return

    // The estimate is not sent: the server works it out from the addresses
    // and the pickup time, because every part of it moves the fare.
    const result = await confirmCab({
      option,
      query: state.query,
      details,
      extras,
      paymentMethod,
      paymentMethodId,
    })

    actions.confirmed(result)
  }

  const summary = (
    <CabFareSummary option={option} estimate={estimate} extras={extras} />
  )

  return (
    <BookingLayout
      steps={STEPS}
      activeId={step}
      onBack={
        step === 'cabs' || step === 'confirmation' ? undefined : actions.back
      }
      backLabel={BACK_LABELS[step]}
      onExit={onExit}
    >
      {step === 'cabs' ? (
        <StepCabs
          query={state.query}
          estimate={estimate}
          onSelectOption={actions.selectOption}
          onModifySearch={onExit}
        />
      ) : null}

      {step === 'details' && option ? (
        <StepDetails
          option={option}
          details={details}
          extras={extras}
          onChange={actions.updateDetails}
          onToggleExtra={actions.toggleExtra}
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
