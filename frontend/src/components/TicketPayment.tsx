import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { formatMoment } from '@/services/payment.services'
import type { PaymentRecord, PaymentStatus } from '@/types/common.types'
import { cn, formatINR } from '@/utils'

const STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  success: { label: 'Paid', className: 'bg-success-surface text-success-fg' },
  refunded: {
    label: 'Refunded',
    className: 'bg-brand-surface text-brand-fg-strong',
  },
  failed: { label: 'Declined', className: 'bg-danger-surface text-danger-fg' },
  pending: { label: 'Processing', className: 'bg-surface-muted text-ink-600' },
}

/** Exported for the account's transaction list, which badges the same way. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const entry = STATUS[status]
  return (
    <Badge
      className={cn(
        'h-auto shrink-0 rounded-full border-0 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide uppercase',
        entry.className,
      )}
    >
      {entry.label}
    </Badge>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold break-words text-ink-900">
        {children}
      </dd>
    </div>
  )
}

/**
 * The payment section of a ticket: which transaction paid for it, how, when,
 * and whether it has since been refunded.
 *
 * Printed with the ticket — the transaction reference is what a traveller
 * quotes to support, and what a bank statement will show.
 */
export function TicketPayment({ payment }: { payment: PaymentRecord | null }) {
  return (
    <div className="mt-6 border-t border-hairline pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
          Payment
        </h3>
        {payment ? <PaymentStatusBadge status={payment.status} /> : null}
      </div>

      {payment ? (
        <dl className="mt-3 grid gap-4 rounded-2xl bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_0.8fr_1.2fr]">
          <Field label="Transaction">
            <span className="font-mono">{payment.transactionRef}</span>
          </Field>
          <Field label={payment.methodLabel}>{payment.instrument}</Field>
          <Field label="Amount">{formatINR(payment.amount)}</Field>
          <Field label={payment.paidAt ? 'Paid on' : 'Attempted'}>
            {payment.paidAt ? formatMoment(payment.paidAt) : 'Not charged'}
          </Field>
        </dl>
      ) : (
        <p className="mt-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-500">
          Not paid yet.
        </p>
      )}
    </div>
  )
}
