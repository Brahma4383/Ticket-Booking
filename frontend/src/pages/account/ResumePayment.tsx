import { useEffect, useState } from 'react'

import { Button, PaymentStep, PaymentStatusBadge, SummaryCard } from '@/components'
import type { CheckoutSession } from '@/hooks'
import { ArrowLeftIcon, InfoIcon, SpinnerIcon } from '@/icons'
import { ApiError } from '@/services/api'
import { fetchPaymentOrder } from '@/services/payment.services'
import type { BookingSummary } from '@/types/account.types'
import type { PaymentOrder } from '@/types/payment.types'
import { formatINR } from '@/utils'

/**
 * Pay for a booking that was made but never paid for.
 *
 * Reached from the account page: the booking flow was left at the payment
 * step, or a payment was declined and the traveller went away. The booking
 * still holds its inventory until its hold runs out, and this is the same
 * payment form the flow uses, pointed at that booking.
 */
export function ResumePayment({
  booking,
  onBack,
  onPaid,
}: {
  booking: BookingSummary
  onBack: () => void
  /** The booking is confirmed; show its ticket. */
  onPaid: () => void
}) {
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Bumped to fetch the order again - after the hold has run out, say. */
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    fetchPaymentOrder(booking.mode, booking.reference, controller.signal)
      .then((next) => {
        setOrder(next)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'That booking could not be loaded.',
        )
      })

    return () => controller.abort()
  }, [booking.mode, booking.reference, version])

  const back = (
    <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
      <ArrowLeftIcon className="h-4 w-4" />
      All bookings
    </Button>
  )

  if (error !== null) {
    return (
      <>
        {back}
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
        >
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </>
    )
  }

  if (order === null) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ink-500">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Loading booking {booking.reference}…
      </p>
    )
  }

  if (order.booking.status !== 'pending') {
    return (
      <>
        {back}
        <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-hairline">
          <InfoIcon className="mx-auto h-10 w-10 text-ink-400" />
          <h2 className="mt-4 text-lg">
            {order.booking.status === 'confirmed'
              ? 'This booking is already paid for'
              : order.booking.status === 'failed'
                ? 'The time to pay for this booking ran out'
                : 'This booking is no longer waiting for payment'}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
            {order.booking.status === 'failed'
              ? 'What it held has gone back on sale, and nothing was charged. Search again to book it afresh.'
              : 'Open it from your bookings to see the ticket.'}
          </p>
          <Button size="lg" className="mt-6" onClick={onBack}>
            Back to bookings
          </Button>
        </div>
      </>
    )
  }

  // The booking already exists, so there is nothing to prepare: every press
  // pays for this one reference.
  const pending = {
    reference: order.booking.reference,
    holdExpiresAt: order.holdExpiresAt,
  }
  const checkout: CheckoutSession = {
    prepare: async () => pending,
    discard: () => undefined,
  }
  const earlier = order.payments.filter((payment) => payment.status === 'failed')
  const partial = order.amountDue !== order.booking.totalAmount

  const summary = (
    <SummaryCard
      title={`${booking.title} · ${booking.reference}`}
      charges={order.fareLines.map((line) => ({
        label: line.label,
        value: line.amount,
      }))}
      total={order.booking.totalAmount}
    >
      {partial ? (
        <p className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4 text-sm">
          <span className="font-semibold text-ink-900">
            {order.amountDue > 0 ? 'Pay now' : 'Charged now'}
          </span>
          <span className="font-bold text-ink-900 tabular-nums">
            {formatINR(order.amountDue)}
          </span>
        </p>
      ) : null}
      {earlier.length > 0 ? (
        <div className="mb-2 space-y-2">
          <p className="text-xs font-semibold tracking-[0.06em] text-ink-400 uppercase">
            Earlier attempts
          </p>
          <ul className="space-y-1.5">
            {earlier.map((payment) => (
              <li
                key={payment.transactionRef}
                className="flex items-center justify-between gap-2 text-xs text-ink-500"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono">{payment.transactionRef}</span>
                  {' · '}
                  {payment.instrument}
                </span>
                <PaymentStatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SummaryCard>
  )

  return (
    <>
      {back}
      <PaymentStep
        mode={booking.mode}
        checkout={checkout}
        amount={order.amountDue}
        onPaid={onPaid}
        summary={summary}
        title="Complete your payment"
        initialOrder={pending}
        onExpired={() => setVersion((current) => current + 1)}
      />
    </>
  )
}
