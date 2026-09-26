import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { SelectField } from '@/components/Select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { CheckoutSession } from '@/hooks/useCheckout'
import { useAuth } from '@/hooks/useAuth'
import { useFormValidation } from '@/hooks/useFormValidation'
import {
  BankIcon,
  CardIcon,
  ClockIcon,
  InfoIcon,
  LockIcon,
  ShieldIcon,
  SpinnerIcon,
  UpiIcon,
  UserIcon,
  WalletIcon,
} from '@/icons'
import { ApiError } from '@/services/api'
import {
  BANKS,
  METHOD_LABELS,
  SANDBOX_NOTES,
  WALLETS,
  formatClock,
  payForBooking,
} from '@/services/payment.services'
import type { BookingMode } from '@/types/account.types'
import type {
  IconComponent,
  PaymentMethodId,
  PaymentRequest,
  PendingOrder,
} from '@/types/common.types'
import { cn, formatINR } from '@/utils'
import {
  cardCvv,
  cardExpiry,
  cardName,
  cardNumber,
  collectErrors,
  upiId,
} from '@/utils/validation'
import type { FormErrors } from '@/utils/validation'

interface Method {
  id: PaymentMethodId
  label: string
  hint: string
  icon: IconComponent
}

const METHODS: Method[] = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm', icon: UpiIcon },
  { id: 'card', label: 'Card', hint: 'Credit or debit', icon: CardIcon },
  { id: 'netbanking', label: 'Netbanking', hint: '50+ banks', icon: BankIcon },
  { id: 'wallet', label: 'Wallet', hint: 'Paytm, Amazon Pay', icon: WalletIcon },
]

interface FormValues {
  method: PaymentMethodId
  upiId: string
  cardNumber: string
  cardName: string
  cardExpiry: string
  cardCvv: string
  bank: string
  wallet: string
}

const INITIAL: FormValues = {
  method: 'upi',
  upiId: '',
  cardNumber: '',
  cardName: '',
  cardExpiry: '',
  cardCvv: '',
  bank: BANKS[0],
  wallet: WALLETS[0],
}

/** Only the chosen method's fields are checked. */
function validate(values: FormValues): FormErrors {
  if (values.method === 'upi') {
    return collectErrors([['upiId', upiId(values.upiId)]])
  }
  if (values.method === 'card') {
    return collectErrors([
      ['cardNumber', cardNumber(values.cardNumber)],
      ['cardName', cardName(values.cardName)],
      ['cardExpiry', cardExpiry(values.cardExpiry)],
      ['cardCvv', cardCvv(values.cardCvv)],
    ])
  }
  return {}
}

/** What goes over the wire: the chosen method's field and nothing else. */
function toRequest(values: FormValues): PaymentRequest {
  switch (values.method) {
    case 'upi':
      return { method: 'upi', upiId: values.upiId.trim() }
    case 'card':
      return {
        method: 'card',
        card: {
          number: values.cardNumber.replace(/\s/g, ''),
          name: values.cardName.trim(),
          expiry: values.cardExpiry.trim(),
          cvv: values.cardCvv.trim(),
        },
      }
    case 'netbanking':
      return { method: 'netbanking', bank: values.bank }
    case 'wallet':
      return { method: 'wallet', wallet: values.wallet }
  }
}

/** `4242424242424242` -> `4242 4242 4242 4242`, as it is typed. */
function groupCardNumber(raw: string) {
  return raw
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** `1239` -> `12/39`, as it is typed. */
function formatExpiry(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

/** `mm:ss` left until `iso`, ticking once a second; null without one. */
function useRemaining(iso: string | null) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!iso) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [iso])

  if (!iso) return null
  const seconds = Math.max(
    0,
    Math.floor((new Date(iso).getTime() - now) / 1000),
  )
  return {
    seconds,
    label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
  }
}

type Phase = 'idle' | 'holding' | 'paying'

interface Failure {
  message: string
  /** The declined attempt's reference, for quoting to support. */
  transactionRef?: string
}

interface PaymentStepProps<T> {
  /** Which module sold the booking — the payment is made against it. */
  mode: BookingMode
  /**
   * Makes, or reuses, the pending booking to pay for. From `useCheckout` in
   * a booking flow; a fixed order when resuming one from the account page.
   */
  checkout: CheckoutSession
  /**
   * What will be charged online, for the button. A cab takes only its
   * advance; a pay-at-hotel stay takes nothing now. The server decides for
   * real — this is only the label.
   */
  amount: number
  /** Handed the mode's own confirmation, now `confirmed`, once paid. */
  onPaid: (booking: T) => void
  summary: ReactNode
  /** Shown instead of "Payment". */
  title?: string
  /** A booking that already exists, for its hold countdown. */
  initialOrder?: PendingOrder | null
  /**
   * Called instead of offering to book afresh when the hold has run out.
   * For resuming a booking, where there is no selection to book again from.
   */
  onExpired?: () => void
}

/**
 * Shown in place of the payment form when nobody is signed in.
 *
 * The gate lives here rather than in each wizard because all five share this
 * step - and here is the last moment it can be asked for. A traveller can
 * search, pick a seat and fill in passenger details as a visitor; only paying
 * needs an account, which is also what the API enforces.
 */
function SignInRequired({ summary }: { summary: ReactNode }) {
  const { requestSignIn } = useAuth()

  return (
    <div>
      <h1 className="text-xl sm:text-2xl">Almost there</h1>
      <p className="mt-1 text-sm text-ink-500">
        Log in to confirm this booking.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-surface text-brand-fg-strong">
            <LockIcon className="h-6 w-6" />
          </div>

          <h2 className="mt-4 text-lg font-bold text-ink-900">
            First, log in to your account
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-500">
            Tickets are issued against an account, so you can find them again,
            check refunds and reuse traveller details next time. Your selection
            is kept while you log in.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => requestSignIn('login')}>
              Log in to continue
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => requestSignIn('signup')}
            >
              Create an account
            </Button>
          </div>

          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
            Nothing has been charged, and nothing is held. Your seats and dates
            are still here when you come back.
          </p>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">{summary}</aside>
      </div>
    </div>
  )
}

/**
 * Payment form shared by every booking flow, and by the account page's
 * "complete payment".
 *
 * Paying is two calls, made one after the other on a single press:
 *
 * 1. `checkout.prepare()` makes the booking as `pending`, which holds its
 *    inventory for a quarter of an hour — or reuses the one already made, on
 *    a retry.
 * 2. `payForBooking` asks the gateway. Approved, the booking is `confirmed`
 *    and its ticket comes back; declined, the attempt is on record, the
 *    booking stays held, and the form stays up for another try.
 *
 * Renders the sign-in gate instead when nobody is logged in. The API refuses
 * an anonymous booking with a 401 regardless - this is so a traveller is
 * asked rather than rejected.
 */
export function PaymentStep<T>({
  mode,
  checkout,
  amount,
  onPaid,
  summary,
  title = 'Payment',
  initialOrder = null,
  onExpired,
}: PaymentStepProps<T>) {
  const { signedIn, restoring, requestSignIn } = useAuth()
  const [values, setValues] = useState<FormValues>(INITIAL)
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [order, setOrder] = useState<PendingOrder | null>(initialOrder)
  const { errors, submit } = useFormValidation(values, validate)
  const remaining = useRemaining(order?.holdExpiresAt ?? null)

  const set =
    (field: keyof FormValues, format?: (raw: string) => string) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = format ? format(event.target.value) : event.target.value
      setValues((current) => ({ ...current, [field]: next }))
    }

  const pay = async () => {
    if (phase !== 'idle') return
    setFailure(null)

    try {
      setPhase('holding')
      const held = await checkout.prepare()
      setOrder(held)

      setPhase('paying')
      const result = await payForBooking<T>(mode, held.reference, toRequest(values))
      checkout.discard()
      onPaid(result.booking)
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFailure({
          message: 'Something went wrong taking the payment. Try again.',
        })
      } else if (error.code === 'payment_declined') {
        setFailure({
          message: error.message,
          transactionRef:
            typeof error.detail?.transactionRef === 'string'
              ? error.detail.transactionRef
              : undefined,
        })
      } else if (error.code === 'payment_expired') {
        // The hold is gone. Forget it, so the next press books afresh -
        // provided the seats are still there to book.
        checkout.discard()
        setOrder(null)
        if (onExpired) {
          onExpired()
          return
        }
        setFailure({
          message:
            'The time to pay ran out and your selection was released. Press ' +
            'pay again to book it afresh, if it is still available.',
        })
      } else if (error.isConflict) {
        setFailure({
          message:
            `${error.message} If you already started paying for this, you ` +
            'will find it under My trips, ready to complete.',
        })
      } else {
        setFailure({ message: error.message })
        // The session ran out between filling the form in and paying. Ask
        // rather than leaving them on a page that will not work.
        if (error.needsSignIn) requestSignIn('login')
      }
    } finally {
      setPhase('idle')
    }
  }

  // `restoring` is the moment on first load when a stored token is still
  // being checked. Showing the gate then would flash "log in" at someone who
  // already is.
  if (!signedIn && !restoring) return <SignInRequired summary={summary} />

  const busy = phase !== 'idle'
  const chargesNothing = amount <= 0

  return (
    <form onSubmit={submit(() => void pay())} noValidate>
      <h1 className="text-xl sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {chargesNothing
          ? 'Nothing is charged now. Choose how to guarantee the booking.'
          : 'Choose how you would like to pay.'}
      </p>

      {order && remaining ? (
        <p
          role="status"
          className={cn(
            'mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm',
            remaining.seconds > 60
              ? 'bg-brand-surface text-brand-fg-strong'
              : 'bg-danger-surface text-danger-fg',
          )}
        >
          <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {remaining.seconds > 0 ? (
              <>
                Held for you until{' '}
                <span className="font-semibold">
                  {formatClock(order.holdExpiresAt ?? '')}
                </span>{' '}
                &middot; <span className="tabular-nums">{remaining.label}</span>{' '}
                left to pay. Reference{' '}
                <span className="font-mono font-semibold">{order.reference}</span>.
              </>
            ) : (
              'The hold on this booking has run out.'
            )}
          </span>
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
          <RadioGroup
            value={values.method}
            onValueChange={(next) =>
              setValues((current) => ({
                ...current,
                method: next as PaymentMethodId,
              }))
            }
            aria-label="Payment method"
            className="grid gap-3 sm:grid-cols-2"
          >
            {METHODS.map((entry) => {
              const Icon = entry.icon
              const active = values.method === entry.id

              return (
                <label
                  key={entry.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-2xl p-4 ring-1 transition-colors',
                    active
                      ? 'bg-brand-surface ring-brand-border'
                      : 'bg-surface-muted ring-transparent hover:ring-hairline',
                  )}
                >
                  <RadioGroupItem value={entry.id} className="sr-only" />
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                      active
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface text-ink-500 ring-1 ring-hairline',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink-900">
                      {entry.label}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {entry.hint}
                    </span>
                  </span>
                </label>
              )
            })}
          </RadioGroup>

          <div className="mt-6 border-t border-hairline pt-6">
            {values.method === 'upi' ? (
              <TextField
                label="UPI ID"
                icon={UpiIcon}
                placeholder="yourname@bank"
                autoComplete="off"
                value={values.upiId}
                onChange={set('upiId')}
                error={errors.upiId}
              />
            ) : null}

            {values.method === 'card' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Card number"
                  icon={CardIcon}
                  inputMode="numeric"
                  placeholder="0000 0000 0000 0000"
                  autoComplete="cc-number"
                  value={values.cardNumber}
                  onChange={set('cardNumber', groupCardNumber)}
                  error={errors.cardNumber}
                  wrapperClassName="sm:col-span-2"
                />
                <TextField
                  label="Name on card"
                  icon={UserIcon}
                  placeholder="As embossed"
                  autoComplete="cc-name"
                  value={values.cardName}
                  onChange={set('cardName')}
                  error={errors.cardName}
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Expiry"
                    inputMode="numeric"
                    placeholder="MM/YY"
                    autoComplete="cc-exp"
                    value={values.cardExpiry}
                    onChange={set('cardExpiry', formatExpiry)}
                    error={errors.cardExpiry}
                  />
                  <TextField
                    label="CVV"
                    type="password"
                    inputMode="numeric"
                    placeholder="***"
                    maxLength={4}
                    autoComplete="cc-csc"
                    value={values.cardCvv}
                    onChange={set('cardCvv', (raw) => raw.replace(/\D/g, ''))}
                    error={errors.cardCvv}
                  />
                </div>
              </div>
            ) : null}

            {values.method === 'netbanking' ? (
              <SelectField
                label="Choose your bank"
                icon={BankIcon}
                options={BANKS}
                value={values.bank}
                onChange={(bank) => setValues((current) => ({ ...current, bank }))}
              />
            ) : null}

            {values.method === 'wallet' ? (
              <SelectField
                label="Choose a wallet"
                icon={WalletIcon}
                options={WALLETS}
                value={values.wallet}
                onChange={(wallet) =>
                  setValues((current) => ({ ...current, wallet }))
                }
              />
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <p className="flex items-start gap-2 font-semibold text-ink-700">
              <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
              Test mode — no real money moves
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-10">
              {SANDBOX_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="mt-2 pl-6">
              Card numbers and CVVs are checked and discarded; only the last
              four digits are kept on the receipt.
            </p>
          </div>
        </section>

        <div className="lg:sticky lg:top-28 lg:self-start">
          {summary}
          <Button
            type="submit"
            fullWidth
            size="lg"
            className="mt-4"
            disabled={busy}
          >
            {busy ? (
              <>
                <SpinnerIcon className="h-5 w-5 animate-spin" />
                {phase === 'holding' ? 'Holding your booking…' : 'Processing…'}
              </>
            ) : (
              <>
                <LockIcon className="h-4 w-4" />
                {chargesNothing
                  ? `Confirm with ${METHOD_LABELS[values.method]}`
                  : `Pay ${formatINR(amount)} securely`}
              </>
            )}
          </Button>
          {busy ? (
            <p role="status" className="mt-3 text-center text-xs text-ink-500">
              {phase === 'holding'
                ? 'Reserving your selection. Please do not close this page.'
                : 'Waiting for the payment to be approved.'}
            </p>
          ) : null}

          {failure ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
            >
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {failure.message}
                {failure.transactionRef ? (
                  <span className="mt-1 block text-xs">
                    Attempt{' '}
                    <span className="font-mono font-semibold">
                      {failure.transactionRef}
                    </span>{' '}
                    was not charged. You can try again, or pay another way.
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  )
}
