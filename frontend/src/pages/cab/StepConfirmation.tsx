import { Button, TicketPayment, TicketStatusHeader } from '@/components'
import { BRAND } from '@/constants'
import {
  CabIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  MapPinIcon,
  PrinterIcon,
  RouteIcon,
} from '@/icons'
import {
  ARRIVAL_BUFFER_NOTE,
  CAB_EXTRAS,
  TRIP_TYPE_LABELS,
  formatDuration,
} from '@/services/cab.services'
import type { CabBookingConfirmation } from '@/types/cab.types'
import { formatINR, formatLongDate } from '@/utils'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  )
}

export function StepConfirmation({
  booking,
  onBookAnother,
  onGoHome,
  onCompletePayment,
}: {
  booking: CabBookingConfirmation
  onBookAnother: () => void
  onGoHome: () => void
  /** Offered on a ticket that is still waiting to be paid for. */
  onCompletePayment?: () => void
}) {
  const { option, estimate, details, fare } = booking

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen state, not ticket content: what the booking is waiting
          for, or that it is done. Hidden when printing. */}
      <TicketStatusHeader
        status={booking.status}
        confirmedTitle="Your cab is booked"
        email={details.email}
        holdExpiresAt={booking.holdExpiresAt}
        onCompletePayment={onCompletePayment}
      />

      <article className="mt-8 overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-hairline">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-5 text-white">
          <div>
            <p className="text-xs tracking-wide text-white/80 uppercase">
              {BRAND.name} cab &middot; Trip ID
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-[0.12em]">
              {booking.bookingId}
            </p>
          </div>
          <CabIcon className="h-9 w-9 text-white/80" />
        </header>

        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg">{option.name}</h2>
              <p className="mt-1 text-sm text-ink-500">
                {option.models}
                <span className="mx-1.5 text-ink-400">&middot;</span>
                {TRIP_TYPE_LABELS[estimate.tripType]}
              </p>
            </div>
            <p className="text-sm font-bold text-ink-900">
              {formatLongDate(details.date)}
              <span className="mx-1.5 font-normal text-ink-400">at</span>
              {details.time}
            </p>
          </div>

          {/* Route */}
          <ol className="mt-5 space-y-4">
            <li className="flex gap-3">
              <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
              </span>
              <span className="min-w-0">
                <span className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                  Pickup
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-ink-900">
                  {details.pickupAddress}
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
              <span className="min-w-0">
                <span className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                  Drop
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-ink-900">
                  {details.dropAddress}
                </span>
              </span>
            </li>
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-surface-muted p-4 text-sm">
            <span className="inline-flex items-center gap-2 text-ink-600">
              <RouteIcon className="h-4 w-4 text-ink-400" />
              <span className="font-bold text-ink-900">
                {estimate.distanceKm} km
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-ink-600">
              <ClockIcon className="h-4 w-4 text-ink-400" />
              <span className="font-bold text-ink-900">
                {formatDuration(estimate.durationMinutes)}
              </span>
            </span>
          </div>

          <dl className="mt-6 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Passenger" value={details.name} />
            <Detail label="Mobile" value={details.phone} />
            <Detail label="Paid now" value={formatINR(fare.payNow)} />
            <Detail label="Pay the driver" value={formatINR(fare.payToDriver)} />
          </dl>

          <TicketPayment payment={booking.payment} />

          {booking.extras.length > 0 ? (
            <div className="mt-6 border-t border-hairline pt-6">
              <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                Extras
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {booking.extras.map((id) => {
                  const extra = CAB_EXTRAS.find((entry) => entry.id === id)
                  return (
                    <li
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink-600"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      {extra?.label}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <p className="mt-6 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold text-ink-700">
                {ARRIVAL_BUFFER_NOTE}
              </span>{' '}
              {option.cancellation}. Distance beyond {option.includedKm} km is
              charged at {formatINR(option.extraKmRate)}/km, and tolls are
              settled against actual receipts.
            </span>
          </p>
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <PrinterIcon className="h-4 w-4" />
          Print details
        </Button>
        <Button variant="secondary" size="lg" onClick={onBookAnother}>
          Book another cab
        </Button>
        <Button size="lg" onClick={onGoHome}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
