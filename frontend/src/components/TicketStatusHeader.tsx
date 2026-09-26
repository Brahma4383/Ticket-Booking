import type { ReactNode } from 'react'

import { Button } from '@/components/Button'
import { CheckIcon, ClockIcon, InfoIcon, RefundIcon } from '@/icons'
import { formatClock } from '@/services/payment.services'
import type { BookingStatus } from '@/types/account.types'
import type { IconComponent } from '@/types/common.types'
import { cn } from '@/utils'

/**
 * The block above every ticket, saying what state the booking is in.
 *
 * The same ticket screen is shown the moment a booking is made and when it
 * is opened again from the account page, and by then it may be pending,
 * cancelled or failed. Each mode's `StepConfirmation` used to congratulate
 * regardless; this reads `status` instead, so a ticket that was never paid
 * for says so — and offers the way to pay for it.
 *
 * Screen state rather than ticket content, so it is hidden when printing.
 */
export function TicketStatusHeader({
  status,
  confirmedTitle,
  email,
  holdExpiresAt,
  onCompletePayment,
}: {
  status: BookingStatus
  /** `Your seats are booked` — what the mode says when all is well. */
  confirmedTitle: string
  /** Where the copy was sent. */
  email: string
  /** Set while the booking is pending: when its hold runs out. */
  holdExpiresAt: string | null
  /** When a pending booking can be paid for from here. */
  onCompletePayment?: () => void
}) {
  const { icon: Icon, tone, title, note } = describe(
    status,
    confirmedTitle,
    email,
    holdExpiresAt,
  )

  return (
    <div className="text-center print:hidden">
      <span
        className={cn(
          'mx-auto grid h-14 w-14 place-items-center rounded-full',
          tone,
        )}
      >
        <Icon className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl sm:text-3xl">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{note}</p>

      {status === 'pending' && onCompletePayment ? (
        <div className="mt-5 flex justify-center">
          <Button size="lg" onClick={onCompletePayment}>
            Complete payment
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function describe(
  status: BookingStatus,
  confirmedTitle: string,
  email: string,
  holdExpiresAt: string | null,
): { icon: IconComponent; tone: string; title: string; note: ReactNode } {
  switch (status) {
    case 'confirmed':
      return {
        icon: CheckIcon,
        tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        title: confirmedTitle,
        note: (
          <>
            A copy has been sent to{' '}
            <span className="font-semibold text-ink-700">{email}</span>.
          </>
        ),
      }
    case 'pending':
      return {
        icon: ClockIcon,
        tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        title: 'Payment pending',
        note: holdExpiresAt
          ? `This booking is held for you until ${formatClock(holdExpiresAt)}. ` +
            'Complete the payment to confirm it.'
          : 'This booking has not been paid for yet.',
      }
    case 'cancelled':
      return {
        icon: RefundIcon,
        tone: 'bg-surface-muted text-ink-500',
        title: 'This booking was cancelled',
        note:
          'Whatever was paid is on its way back to the way you paid, within ' +
          'five working days.',
      }
    case 'failed':
      return {
        icon: InfoIcon,
        tone: 'bg-danger-surface text-danger-fg',
        title: 'This booking was not completed',
        note:
          'It was not paid for in time, so what it held went back on sale. ' +
          'Nothing has been charged.',
      }
    case 'completed':
      return {
        icon: CheckIcon,
        tone: 'bg-brand-surface text-brand-fg-strong',
        title: 'Journey completed',
        note: 'Thanks for travelling with us.',
      }
  }
}
