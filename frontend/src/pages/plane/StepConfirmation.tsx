import { Button, TicketPayment, TicketStatusHeader } from '@/components'
import { BRAND } from '@/constants'
import {
  ArrowRightIcon,
  CheckIcon,
  InfoIcon,
  LuggageIcon,
  PlaneIcon,
  PrinterIcon,
} from '@/icons'
import { ADD_ONS, describeStops, formatDuration } from '@/services/plane.services'
import type { PlaneBookingConfirmation } from '@/types/plane.types'
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
  booking: PlaneBookingConfirmation
  onBookAnother: () => void
  onGoHome: () => void
  /** Offered on a ticket that is still waiting to be paid for. */
  onCompletePayment?: () => void
}) {
  const { trip, query, fareBrand, travellers, fare } = booking
  const unseated = travellers.filter((t) => t.type !== 'infant' && !t.seatId)

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen state, not ticket content: what the booking is waiting
          for, or that it is done. Hidden when printing. */}
      <TicketStatusHeader
        status={booking.status}
        confirmedTitle="Your flight is booked"
        email={booking.contact.email}
        holdExpiresAt={booking.holdExpiresAt}
        onCompletePayment={onCompletePayment}
      />

      <article className="mt-8 overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-hairline">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-5 text-white">
          <div>
            <p className="text-xs tracking-wide text-white/80 uppercase">
              {BRAND.name} e-ticket &middot; Booking reference
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-[0.15em]">
              {booking.reference}
            </p>
          </div>
          <PlaneIcon className="h-9 w-9 text-white/80" />
        </header>

        <div className="px-6 py-6">
          {/* Route */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg">
                {trip.airline}
                <span className="ml-2 text-sm font-semibold text-ink-400">
                  {trip.airlineCode}-{trip.flightNumber}
                </span>
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {formatLongDate(query.date)}
                <span className="mx-1.5 text-ink-400">&middot;</span>
                {trip.aircraft}
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

          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-surface-muted p-4">
            <div>
              <p className="text-lg font-extrabold text-ink-900">
                {trip.from.code}
              </p>
              <p className="text-xs text-ink-500">
                {trip.from.city} &middot; {trip.from.terminal}
              </p>
            </div>
            <div className="flex-1 text-center">
              <ArrowRightIcon className="mx-auto h-4 w-4 text-ink-400" />
              <p className="mt-1 text-[0.7rem] font-semibold text-ink-500">
                {describeStops(trip.stops)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold text-ink-900">
                {trip.to.code}
              </p>
              <p className="text-xs text-ink-500">
                {trip.to.city} &middot; {trip.to.terminal}
              </p>
            </div>
          </div>

          <dl className="mt-6 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Fare" value={fareBrand.name} />
            <Detail
              label="Baggage"
              value={`${fareBrand.cabinBaggageKg} + ${fareBrand.checkInBaggageKg} kg`}
            />
            <Detail label="Paid with" value={booking.paymentMethod || 'Not paid yet'} />
            <Detail
              label={booking.status === 'pending' ? 'Total due' : 'Total paid'}
              value={formatINR(fare.total)}
            />
          </dl>

          <TicketPayment payment={booking.payment} />

          {/* Travellers */}
          <div className="mt-6 border-t border-hairline pt-6">
            <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
              Travellers &amp; seats
            </h3>
            <ul className="mt-3 space-y-2">
              {travellers.map((traveller) => (
                <li
                  key={traveller.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-900">
                      {traveller.title} {traveller.firstName}{' '}
                      {traveller.lastName}
                    </span>
                    <span className="text-xs text-ink-500 capitalize">
                      {traveller.type}
                      <span className="mx-1.5 text-ink-400">&middot;</span>
                      <span className="normal-case">
                        e-ticket {traveller.eTicket}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-bold text-ink-700 ring-1 ring-hairline">
                    {traveller.type === 'infant'
                      ? 'On lap'
                      : (traveller.seatId ?? 'Seat at check-in')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {booking.addOns.length > 0 ? (
            <div className="mt-6 border-t border-hairline pt-6">
              <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                Add-ons
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {booking.addOns.map((id) => {
                  const addOn = ADD_ONS.find((entry) => entry.id === id)
                  return (
                    <li
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink-600"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      {addOn?.label}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <p className="mt-6 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <LuggageIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Check-in opens 48 hours before departure and closes 60 minutes
              before. Reach {trip.from.terminal} at least two hours ahead.{' '}
              {unseated.length > 0
                ? `${unseated.length} traveller${unseated.length === 1 ? '' : 's'} will be given a seat at check-in. `
                : ''}
              {fareBrand.cancellation}.
            </span>
          </p>

          <p className="mt-3 flex items-start gap-2 text-xs text-ink-400">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            Carry the photo ID used at booking for every traveller.
          </p>
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <PrinterIcon className="h-4 w-4" />
          Print ticket
        </Button>
        <Button variant="secondary" size="lg" onClick={onBookAnother}>
          Book another flight
        </Button>
        <Button size="lg" onClick={onGoHome}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
