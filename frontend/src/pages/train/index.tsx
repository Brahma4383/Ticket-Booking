import { useEffect } from 'react'

import { BookingLayout, PaymentStep } from '@/components'
import { useStepHistory } from '@/hooks'
import { confirmTrainBooking } from '@/services/train.services'
import type { BookingStepMeta, PaymentMethodId } from '@/types/common.types'
import type { TrainSearchQuery } from '@/types/train.types'

import { StepConfirmation } from './StepConfirmation'
import { StepPassengers } from './StepPassengers'
import { StepReview } from './StepReview'
import { StepTrains } from './StepTrains'
import { TrainFareSummary } from './TrainFareSummary'
import { TRAIN_STEP_ORDER, useTrainBooking } from './useTrainBooking'

const STEPS: BookingStepMeta[] = [
  { id: 'trains', label: 'Choose train' },
  { id: 'review', label: 'Class & quota' },
  { id: 'passengers', label: 'Passengers' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Ticket' },
]

const BACK_LABELS: Record<string, string> = {
  review: 'Back to train list',
  passengers: 'Back to class & quota',
  payment: 'Back to passengers',
}

/**
 * The train booking wizard: trains -> class & quota -> passengers -> payment
 * -> ticket.
 *
 * Unlike buses there is no seat map: the railways allot a coach and berth when
 * the chart is prepared, so the traveller picks a class and states a berth
 * preference instead.
 *
 * The search has a URL — `App.tsx` routes it here and passes the query
 * string in as `query` — but the steps within the flow do not, so the
 * browser Back button returns to the search rather than stepping back a
 * step; every step has its own Back control.
 */
export function TrainBooking({
  query,
  onExit,
}: {
  query: TrainSearchQuery
  onExit: () => void
}) {
  const { state, actions, boardingStation } = useTrainBooking(query)
  const { step, trip, classOption, quota, passengers, contact, insured } = state

  // Each step gets its own history entry, so the browser's Back button
  // steps back through the flow instead of leaving it.
  useStepHistory({ step, order: TRAIN_STEP_ORDER, goTo: actions.goTo })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  const handlePay = async (
    paymentMethod: string,
    paymentMethodId: PaymentMethodId,
  ) => {
    if (!trip || !classOption || !boardingStation) return

    const result = await confirmTrainBooking({
      trip,
      query: state.query,
      classOption,
      quota,
      boardingStation,
      passengers,
      contact,
      paymentMethod,
      paymentMethodId,
      insured,
    })

    actions.confirmed(result)
  }

  const summary = (
    <TrainFareSummary
      classOption={classOption}
      quota={quota}
      passengerCount={passengers.length}
      insured={insured}
    />
  )

  return (
    <BookingLayout
      steps={STEPS}
      activeId={step}
      onBack={
        step === 'trains' || step === 'confirmation' ? undefined : actions.back
      }
      backLabel={BACK_LABELS[step]}
      onExit={onExit}
    >
      {step === 'trains' ? (
        <StepTrains
          query={state.query}
          onQueryChange={actions.setQuery}
          onSelectClass={actions.selectClass}
          onModifySearch={onExit}
        />
      ) : null}

      {step === 'review' && trip && classOption ? (
        <StepReview
          trip={trip}
          classOption={classOption}
          quota={quota}
          boardingCode={state.boardingCode}
          passengerCount={passengers.length}
          insured={insured}
          onQuotaChange={actions.setQuota}
          onBoardingChange={actions.setBoarding}
          onChangeClass={actions.changeClass}
          onContinue={() => actions.goTo('passengers')}
        />
      ) : null}

      {step === 'passengers' ? (
        <StepPassengers
          passengers={passengers}
          contact={contact}
          quota={quota}
          insured={insured}
          onAdd={actions.addPassenger}
          onRemove={actions.removePassenger}
          onChange={actions.updatePassenger}
          onContactChange={actions.updateContact}
          onInsuredChange={actions.setInsured}
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
