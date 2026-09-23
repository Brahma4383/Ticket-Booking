import { Button } from '@/components'
import { BRAND } from '@/constants'
import {
  ArrowRightIcon,
  CheckIcon,
  InfoIcon,
  MapPinIcon,
  PrinterIcon,
  TrainIcon,
} from '@/icons'
import { QUOTA_LABELS, formatDuration } from '@/services/train.services'
import type { TrainBookingConfirmation } from '@/types/train.types'
import { cn, formatINR, formatLongDate } from '@/utils'

const STATUS_STYLE = (status: string) =>
  status.startsWith('CNF')
    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
    : status.startsWith('RAC')
      ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
      : 'bg-red-500/12 text-red-700 dark:text-red-400'

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
}: {
  booking: TrainBookingConfirmation
  onBookAnother: () => void
  onGoHome: () => void
}) {
  const { trip, query, classOption, passengers, fare, boardingStation } = booking
  const anyUnconfirmed = passengers.some((p) => !p.status.startsWith('CNF'))

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen state, not ticket content: a printed ticket does not
          need congratulating, and this is half a page of it. */}
      <div className="text-center print:hidden">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl sm:text-3xl">Your ticket is booked</h1>
        <p className="mt-2 text-sm text-ink-500">
          A copy has been sent to{' '}
          <span className="font-semibold text-ink-700">
            {booking.contact.email}
          </span>
          .
        </p>
      </div>

      <article className="mt-8 overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-hairline">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-5 text-white">
          <div>
            <p className="text-xs tracking-wide text-white/80 uppercase">
              {BRAND.name} e-ticket &middot; PNR
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">
              {booking.pnr}
            </p>
          </div>
          <TrainIcon className="h-9 w-9 text-white/80" />
        </header>

        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg">
                {trip.name}
                <span className="ml-2 text-sm font-semibold text-ink-400 tabular-nums">
                  #{trip.number}
                </span>
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
                <span>
                  {query.from} ({trip.from.code})
                </span>
                <ArrowRightIcon className="h-4 w-4 text-ink-400" />
                <span>
                  {query.to} ({trip.to.code})
                </span>
                <span className="text-ink-400">&middot;</span>
                {formatLongDate(query.date)}
              </p>
            </div>
            <p className="text-sm font-bold text-ink-900 tabular-nums">
              {trip.departure} &rarr; {trip.arrival}
              {trip.daysToArrive > 0 ? (
                <span className="align-super text-[0.65rem] text-brand-fg">
                  +{trip.daysToArrive}
                </span>
              ) : null}
              <span className="ml-2 text-xs font-normal text-ink-400">
                ({formatDuration(trip.durationMinutes)})
              </span>
            </p>
          </div>

          <dl className="mt-6 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Class" value={classOption.code} />
            <Detail label="Quota" value={QUOTA_LABELS[booking.quota]} />
            <Detail label="Paid with" value={booking.paymentMethod} />
            <Detail label="Total paid" value={formatINR(fare.total)} />
          </dl>

          <div className="mt-6 flex gap-3 border-t border-hairline pt-6">
            <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                Board at &middot; {boardingStation.time}
                {boardingStation.dayOffset > 0
                  ? ` (+${boardingStation.dayOffset})`
                  : ''}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-900">
                {boardingStation.name} ({boardingStation.code})
              </p>
            </div>
          </div>

          {/* Allotment */}
          <div className="mt-6 border-t border-hairline pt-6">
            <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
              Passengers &amp; berths
            </h3>
            <ul className="mt-3 space-y-2">
              {passengers.map((passenger) => (
                <li
                  key={passenger.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-900">
                      {passenger.name}
                    </span>
                    <span className="text-xs text-ink-500">
                      {passenger.age} yrs
                      <span className="mx-1.5 text-ink-400">&middot;</span>
                      <span className="capitalize">{passenger.gender}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-semibold text-ink-700 tabular-nums">
                      {passenger.allottedBerth}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[0.7rem] font-bold',
                        STATUS_STYLE(passenger.status),
                      )}
                    >
                      {passenger.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold text-ink-700">
                {booking.chartStatus}.
              </span>{' '}
              {anyUnconfirmed
                ? 'Waitlisted and RAC passengers should check the status again after the chart is prepared, about four hours before departure. '
                : ''}
              {trip.cancellationPolicy} Carry the photo ID used at booking.
            </span>
          </p>
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <PrinterIcon className="h-4 w-4" />
          Print ticket
        </Button>
        <Button variant="secondary" size="lg" onClick={onBookAnother}>
          Book another train
        </Button>
        <Button size="lg" onClick={onGoHome}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
