import { Button, TicketPayment, TicketStatusHeader } from '@/components'
import { BRAND } from '@/constants'
import {
  ClockIcon,
  HotelIcon,
  InfoIcon,
  MapPinIcon,
  PrinterIcon,
  StarIcon,
} from '@/icons'
import type { HotelBookingConfirmation } from '@/types/hotel.types'
import { cn, formatINR, formatLongDate } from '@/utils'

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
  booking: HotelBookingConfirmation
  onBookAnother: () => void
  onGoHome: () => void
  /** Offered on a ticket that is still waiting to be paid for. */
  onCompletePayment?: () => void
}) {
  const { property, room, ratePlan, query, fare, guest } = booking

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen state, not ticket content: what the booking is waiting
          for, or that it is done. Hidden when printing. */}
      <TicketStatusHeader
        status={booking.status}
        confirmedTitle="Your stay is booked"
        email={guest.email}
        holdExpiresAt={booking.holdExpiresAt}
        onCompletePayment={onCompletePayment}
      />

      <article className="mt-8 overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-hairline">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-5 text-white">
          <div>
            <p className="text-xs tracking-wide text-white/80 uppercase">
              {BRAND.name} voucher &middot; Booking ID
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-[0.12em]">
              {booking.bookingId}
            </p>
          </div>
          <HotelIcon className="h-9 w-9 text-white/80" />
        </header>

        <div
          className={cn(
            'grid h-24 place-items-center bg-gradient-to-br',
            property.imageAccent,
          )}
          aria-hidden="true"
        >
          <HotelIcon className="h-8 w-8 text-white/70" />
        </div>

        <div className="px-6 py-6">
          <h2 className="flex flex-wrap items-center gap-2 text-lg">
            <span className="min-w-0">{property.name}</span>
            {property.starRating > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                aria-label={`${property.starRating} star`}
              >
                {Array.from({ length: property.starRating }, (_, index) => (
                  <StarIcon key={index} className="h-4 w-4 text-accent-500" />
                ))}
              </span>
            ) : null}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
            <MapPinIcon className="h-4 w-4 shrink-0" />
            {property.locality}, {property.city}
          </p>

          {/* Dates */}
          <div className="mt-5 grid gap-4 rounded-2xl bg-surface-muted p-4 sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <p className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                Check-in
              </p>
              <p className="mt-1 text-sm font-bold text-ink-900">
                {formatLongDate(query.checkIn)}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <ClockIcon className="h-3.5 w-3.5" />
                From {property.checkInTime}
              </p>
            </div>
            <div className="hidden place-items-center sm:grid">
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-ink-600 ring-1 ring-hairline">
                {fare.nights} night{fare.nights === 1 ? '' : 's'}
              </span>
            </div>
            <div className="sm:text-right">
              <p className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                Check-out
              </p>
              <p className="mt-1 text-sm font-bold text-ink-900">
                {formatLongDate(query.checkOut)}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-ink-500 sm:justify-end">
                <ClockIcon className="h-3.5 w-3.5" />
                By {property.checkOutTime}
              </p>
            </div>
          </div>

          <dl className="mt-6 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Room" value={room.name} />
            <Detail
              label="Rooms & guests"
              value={`${fare.rooms} room${fare.rooms === 1 ? '' : 's'}, ${query.guests} guest${query.guests === 1 ? '' : 's'}`}
            />
            <Detail label="Paid with" value={booking.paymentMethod || 'Not paid yet'} />
            <Detail label="Total" value={formatINR(fare.total)} />
          </dl>

          <TicketPayment payment={booking.payment} />

          <div className="mt-6 border-t border-hairline pt-6">
            <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
              Lead guest
            </h3>
            <p className="mt-2 text-sm font-semibold text-ink-900">
              {guest.name}
            </p>
            <p className="text-xs text-ink-500">
              {guest.phone}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              Arriving {guest.arrival || 'time not given'}
            </p>
            {guest.requests.trim() ? (
              <p className="mt-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
                <span className="font-semibold text-ink-700">Requests:</span>{' '}
                {guest.requests}
              </p>
            ) : null}
          </div>

          <p className="mt-6 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold text-ink-700">
                {ratePlan.name}.
              </span>{' '}
              {ratePlan.cancellationNote}.
              {ratePlan.payAtHotel
                ? ' Settle the bill at the property on arrival.'
                : ''}
            </span>
          </p>
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <PrinterIcon className="h-4 w-4" />
          Print voucher
        </Button>
        <Button variant="secondary" size="lg" onClick={onBookAnother}>
          Book another stay
        </Button>
        <Button size="lg" onClick={onGoHome}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
