import { useEffect, useState } from 'react'

import { Button, Modal, PaymentStatusBadge } from '@/components'
import {
  BusIcon,
  CabIcon,
  ChevronRightIcon,
  HotelIcon,
  InfoIcon,
  PlaneIcon,
  SpinnerIcon,
  TrainIcon,
  WalletIcon,
} from '@/icons'
import { ApiError } from '@/services/api'
import {
  fetchReceipt,
  fetchTransactions,
  formatMoment,
} from '@/services/payment.services'
import type { BookingMode } from '@/types/account.types'
import type { Receipt, Transaction } from '@/types/payment.types'
import { formatINR } from '@/utils'

const MODES: Record<BookingMode, { label: string; icon: typeof BusIcon }> = {
  bus: { label: 'Bus', icon: BusIcon },
  train: { label: 'Train', icon: TrainIcon },
  plane: { label: 'Flight', icon: PlaneIcon },
  hotel: { label: 'Stay', icon: HotelIcon },
  cab: { label: 'Cab', icon: CabIcon },
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold break-words text-ink-900">
        {value}
      </dd>
    </div>
  )
}

/** One transaction in full, fetched when its row is opened. */
function ReceiptBody({ transactionRef }: { transactionRef: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetchReceipt(transactionRef, controller.signal)
      .then(setReceipt)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'That receipt could not be loaded.',
        )
      })

    return () => controller.abort()
  }, [transactionRef])

  if (error !== null) {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-danger-fg">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
        {error}
      </p>
    )
  }

  if (receipt === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-500">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Loading receipt…
      </p>
    )
  }

  const { booking } = receipt
  const fareTotal = receipt.fareLines.reduce((sum, line) => sum + line.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm font-bold text-ink-900">
          {receipt.transactionRef}
        </span>
        <PaymentStatusBadge status={receipt.status} />
      </div>

      <dl className="mt-4 space-y-2 rounded-2xl bg-surface-muted p-4 text-sm">
        <Row
          label="Booking"
          value={`${MODES[booking.mode].label} · ${booking.reference}`}
        />
        <Row label={receipt.methodLabel} value={receipt.instrument} />
        <Row
          label={receipt.paidAt ? 'Paid on' : 'Status'}
          value={receipt.paidAt ? formatMoment(receipt.paidAt) : 'Not charged'}
        />
        <Row label="Receipt sent to" value={booking.contactEmail} />
        {booking.cancelledAt ? (
          <Row label="Cancelled on" value={formatMoment(booking.cancelledAt)} />
        ) : null}
      </dl>

      <h3 className="mt-5 text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
        Fare
      </h3>
      <dl className="mt-2 space-y-2 text-sm">
        {receipt.fareLines.map((line) => (
          <div key={line.label} className="flex justify-between gap-4">
            <dt className="text-ink-500">{line.label}</dt>
            <dd className="font-semibold text-ink-700 tabular-nums">
              {formatINR(line.amount)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-hairline pt-2">
          <dt className="font-bold text-ink-900">Fare total</dt>
          <dd className="font-bold text-ink-900 tabular-nums">
            {formatINR(fareTotal)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-bold text-ink-900">
            {receipt.status === 'refunded'
              ? 'Refunded'
              : receipt.status === 'success'
                ? 'This payment'
                : 'Attempted'}
          </dt>
          <dd className="text-lg font-extrabold text-ink-900 tabular-nums">
            {formatINR(receipt.amount)}
          </dd>
        </div>
      </dl>

      {receipt.amount < fareTotal && receipt.status !== 'failed' ? (
        <p className="mt-3 text-xs text-ink-500">
          {receipt.amount === 0
            ? 'Nothing was taken online: the stay is paid at the property.'
            : `The remaining ${formatINR(fareTotal - receipt.amount)} is paid to the driver at the end of the trip.`}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The account's payment history: every attempt, whether it went through,
 * was declined or has since been refunded — newest first.
 */
export function Transactions() {
  const [rows, setRows] = useState<Transaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Transaction | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetchTransactions(controller.signal)
      .then((next) => {
        setRows(next)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Your payments could not be loaded.',
        )
      })

    return () => controller.abort()
  }, [])

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

  if (rows === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-500">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Loading your payments…
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-hairline">
        <WalletIcon className="mx-auto h-10 w-10 text-ink-400" />
        <h3 className="mt-4 text-lg">No payments yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          Every payment you make — and every refund — will be listed here.
        </p>
      </div>
    )
  }

  const paid = rows
    .filter((row) => row.status === 'success')
    .reduce((sum, row) => sum + row.amount, 0)
  const refunded = rows
    .filter((row) => row.status === 'refunded')
    .reduce((sum, row) => sum + row.amount, 0)

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-hairline">
          <dt className="text-xs font-semibold text-ink-500">Paid</dt>
          <dd className="mt-1 text-xl font-extrabold text-ink-900 tabular-nums">
            {formatINR(paid)}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-hairline">
          <dt className="text-xs font-semibold text-ink-500">Refunded</dt>
          <dd className="mt-1 text-xl font-extrabold text-ink-900 tabular-nums">
            {formatINR(refunded)}
          </dd>
        </div>
      </dl>

      <ul className="mt-6 grid gap-3">
        {rows.map((row) => {
          const mode = MODES[row.booking.mode]
          const Icon = mode.icon

          return (
            <li key={row.transactionRef}>
              <button
                type="button"
                onClick={() => setOpen(row)}
                className="flex w-full cursor-pointer flex-col gap-3 rounded-3xl bg-surface p-4 text-left ring-1 ring-hairline transition-shadow hover:shadow-card hover:ring-brand-border sm:flex-row sm:items-center sm:p-5"
              >
                <span className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-sm font-bold break-all text-ink-900">
                        {row.transactionRef}
                      </span>
                      <PaymentStatusBadge status={row.status} />
                    </span>
                    <span className="mt-1 block text-sm break-words text-ink-500">
                      {mode.label} {row.booking.reference} &middot;{' '}
                      {row.instrument}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-400">
                      {row.paidAt ? formatMoment(row.paidAt) : 'Not charged'}
                    </span>
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3 border-t border-hairline pt-3 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1 sm:border-0 sm:pt-0">
                  <span className="text-lg font-extrabold text-ink-900 tabular-nums">
                    {formatINR(row.amount)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-brand-fg">
                    Receipt
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title="Payment receipt"
        subtitle={open ? `${MODES[open.booking.mode].label} booking ${open.booking.reference}` : undefined}
      >
        {open ? <ReceiptBody key={open.transactionRef} transactionRef={open.transactionRef} /> : null}
        <Button fullWidth className="mt-6" onClick={() => setOpen(null)}>
          Close
        </Button>
      </Modal>
    </>
  )
}
