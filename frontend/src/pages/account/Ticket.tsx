import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components'
import { ArrowLeftIcon, InfoIcon, SpinnerIcon } from '@/icons'
import { StepConfirmation as BusConfirmation } from '@/pages/bus/StepConfirmation'
import { StepConfirmation as CabConfirmation } from '@/pages/cab/StepConfirmation'
import { StepConfirmation as HotelConfirmation } from '@/pages/hotel/StepConfirmation'
import { StepConfirmation as PlaneConfirmation } from '@/pages/plane/StepConfirmation'
import { StepConfirmation as TrainConfirmation } from '@/pages/train/StepConfirmation'
import { ApiError } from '@/services/api'
import { fetchBooking as fetchBusBooking } from '@/services/bus.services'
import { fetchCabBooking } from '@/services/cab.services'
import { fetchStayBooking } from '@/services/hotel.services'
import { fetchFlightBooking } from '@/services/plane.services'
import { fetchTrainBooking } from '@/services/train.services'
import type { BookingMode } from '@/types/account.types'

/**
 * One booked ticket, opened from the account list.
 *
 * Nothing here draws a ticket. Each mode already has a `StepConfirmation`
 * that renders exactly what its `bookings/<reference>/` endpoint returns —
 * the screen shown the moment a booking is made — so this fetches and hands
 * over. A ticket looked up a month later is then the same screen, by
 * construction, rather than a second layout that drifts from it.
 */

interface TicketProps {
  reference: string
  /** Back to the list. */
  onBack: () => void
  /** Out to the home page, where a new search starts. */
  onGoHome: () => void
}

/**
 * Fetch-then-render, generic over the five unrelated confirmation shapes.
 *
 * `T` is inferred per call site from `load`, so each mode keeps its own type
 * end to end and `render` cannot be handed the wrong one.
 */
function Loader<T>({
  reference,
  load,
  render,
  onBack,
}: {
  reference: string
  load: (reference: string, signal?: AbortSignal) => Promise<T>
  render: (booking: T) => ReactNode
  onBack: () => void
}) {
  const [booking, setBooking] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  // No state reset here: each <Loader> is keyed by its reference, so a
  // different ticket remounts with fresh state rather than briefly showing
  // the previous one's.
  useEffect(() => {
    const controller = new AbortController()

    load(reference, controller.signal).then(setBooking).catch((cause: unknown) => {
      // An abort reaches here as a network ApiError, because `request()` wraps
      // every fetch rejection. Leaving state alone is the whole handling.
      if (controller.signal.aborted) return
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'That ticket could not be loaded.',
      )
    })

    return () => controller.abort()
  }, [reference, load])

  if (error !== null) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
      >
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  if (booking === null) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ink-500">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Loading ticket {reference}…
      </p>
    )
  }

  return (
    <>
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3 print:hidden">
        <ArrowLeftIcon className="h-4 w-4" />
        All bookings
      </Button>
      {render(booking)}
    </>
  )
}

export function Ticket({
  mode,
  reference,
  onBack,
  onGoHome,
}: TicketProps & { mode: BookingMode }) {
  // `onBookAnother` and `onGoHome` both leave for the home page: a booked
  // ticket has no next step inside the account, and searching starts there.
  const exits = { onBookAnother: onGoHome, onGoHome }

  switch (mode) {
    case 'bus':
      return (
        <Loader
          key={reference}
          reference={reference}
          load={fetchBusBooking}
          onBack={onBack}
          render={(booking) => <BusConfirmation booking={booking} {...exits} />}
        />
      )
    case 'train':
      return (
        <Loader
          key={reference}
          reference={reference}
          load={fetchTrainBooking}
          onBack={onBack}
          render={(booking) => <TrainConfirmation booking={booking} {...exits} />}
        />
      )
    case 'plane':
      return (
        <Loader
          key={reference}
          reference={reference}
          load={fetchFlightBooking}
          onBack={onBack}
          render={(booking) => <PlaneConfirmation booking={booking} {...exits} />}
        />
      )
    case 'hotel':
      return (
        <Loader
          key={reference}
          reference={reference}
          load={fetchStayBooking}
          onBack={onBack}
          render={(booking) => <HotelConfirmation booking={booking} {...exits} />}
        />
      )
    case 'cab':
      return (
        <Loader
          key={reference}
          reference={reference}
          load={fetchCabBooking}
          onBack={onBack}
          render={(booking) => <CabConfirmation booking={booking} {...exits} />}
        />
      )
  }
}
