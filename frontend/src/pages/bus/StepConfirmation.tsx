import { Button, TicketPayment, TicketStatusHeader } from '@/components'
import { BRAND } from '@/constants'
import {
  ArrowRightIcon,
  MapPinIcon,
  PrinterIcon,
  TicketIcon,
} from '@/icons'
import { formatDuration } from '@/services/bus.services'
import type { BookingConfirmation } from '@/types/bus.types'
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
  booking: BookingConfirmation
  onBookAnother: () => void
  onGoHome: () => void
  /** Offered on a ticket that is still waiting to be paid for. */
  onCompletePayment?: () => void
}) {
  const { trip, query, seats, passengers, fare } = booking

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen state, not ticket content: what the booking is waiting
          for, or that it is done. Hidden when printing. */}
      <TicketStatusHeader
        status={booking.status}
        confirmedTitle="Your seats are booked"
        email={booking.contact.email}
        holdExpiresAt={booking.holdExpiresAt}
        onCompletePayment={onCompletePayment}
      />

      {/* Ticket */}
      <article className="mt-8 overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-hairline">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-5 text-white">
          <div>
            <p className="text-xs tracking-wide text-white/80 uppercase">
              {BRAND.name} e-ticket
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">
              {booking.pnr}
            </p>
          </div>
          <TicketIcon className="h-9 w-9 text-white/80" />
        </header>

        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-lg">
                <span>{query.from}</span>
                <ArrowRightIcon className="h-5 w-5 text-ink-400" />
                <span>{query.to}</span>
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {formatLongDate(query.date)}
                <span className="mx-1.5 text-ink-400">&middot;</span>
                {trip.operator}
              </p>
            </div>
            <p className="text-sm font-bold text-ink-900 tabular-nums">
              {trip.departure} &rarr; {trip.arrival}
              {trip.arrivesNextDay ? (
                <span className="align-super text-[0.65rem] text-brand-fg">
                  +1
                </span>
              ) : null}
              <span className="ml-2 text-xs font-normal text-ink-400">
                ({formatDuration(trip.durationMinutes)})
              </span>
            </p>
          </div>

          <dl className="mt-6 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2">
            <Detail
              label="Seats"
              value={seats.map((seat) => seat.id).join(', ')}
            />
            <Detail
              label="Bus"
              value={`${trip.airConditioned ? 'A/C' : 'Non A/C'} ${
                trip.kind === 'sleeper' ? 'Sleeper' : 'Seater'
              } (${trip.layout})`}
            />
            <Detail label="Paid with" value={booking.paymentMethod || 'Not paid yet'} />
            <Detail
              label={booking.status === 'pending' ? 'Total due' : 'Total paid'}
              value={formatINR(fare.total)}
            />
          </dl>

          <TicketPayment payment={booking.payment} />

          <div className="mt-6 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2">
            {[
              { title: 'Board at', point: booking.boardingPoint },
              { title: 'Get off at', point: booking.droppingPoint },
            ].map((entry) => (
              <div key={entry.title} className="flex gap-3">
                <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                    {entry.title} &middot; {entry.point.time}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    {entry.point.name}
                  </p>
                  <p className="text-xs text-ink-500">
                    {entry.point.landmark}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-hairline pt-6">
            <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
              Travellers
            </h3>
            <ul className="mt-3 space-y-2">
              {passengers.map((passenger) => (
                <li
                  key={passenger.seatId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-semibold text-ink-900">
                    {passenger.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-500">
                    {passenger.age} yrs
                    <span className="mx-1.5 text-ink-400">&middot;</span>
                    <span className="capitalize">{passenger.gender}</span>
                    <span className="mx-1.5 text-ink-400">&middot;</span>
                    Seat {passenger.seatId}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <span className="font-semibold text-ink-700">Cancellation:</span>{' '}
            {trip.cancellationPolicy} Carry a photo ID matching the lead
            passenger&rsquo;s name.
          </p>
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <PrinterIcon className="h-4 w-4" />
          Print ticket
        </Button>
        <Button variant="secondary" size="lg" onClick={onBookAnother}>
          Book another bus
        </Button>
        <Button size="lg" onClick={onGoHome}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
