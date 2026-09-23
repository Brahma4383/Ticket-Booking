import type { FormEvent, ReactNode } from 'react'
import { useState } from 'react'

import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { SelectField } from '@/components/Select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import {
  BankIcon,
  CardIcon,
  InfoIcon,
  LockIcon,
  ShieldIcon,
  SpinnerIcon,
  UpiIcon,
  UserIcon,
  WalletIcon,
} from '@/icons'
import type { IconComponent, PaymentMethodId } from '@/types/common.types'
import { cn } from '@/utils'

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

const BANKS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
]

const WALLETS = ['Paytm', 'Amazon Pay', 'PhonePe Wallet', 'Mobikwik']

const METHOD_LABEL: Record<PaymentMethodId, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
}

interface PaymentStepProps {
  /**
   * `methodLabel` is what the ticket prints — `UPI`, `Card`, or the bank or
   * wallet chosen. `methodId` is which of the four methods that is, which the
   * API stores separately: `payment.method` only admits the four, and the
   * label goes in `payment.instrument`.
   */
  onPay: (methodLabel: string, methodId: PaymentMethodId) => Promise<void>
  summary: ReactNode
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
 * Payment form shared by every booking flow.
 *
 * Renders the sign-in gate instead when nobody is logged in. The API refuses
 * an anonymous booking with a 401 regardless - this is so a traveller is
 * asked rather than rejected.
 */
export function PaymentStep({ onPay, summary }: PaymentStepProps) {
  const { signedIn, restoring, requestSignIn } = useAuth()
  const [method, setMethod] = useState<PaymentMethodId>('upi')
  const [bank, setBank] = useState(BANKS[0])
  const [wallet, setWallet] = useState(WALLETS[0])
  const [processing, setProcessing] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (processing) return

    setProcessing(true)
    setFailure(null)
    const detail =
      method === 'netbanking'
        ? bank
        : method === 'wallet'
          ? wallet
          : METHOD_LABEL[method]

    try {
      await onPay(detail, method)
    } catch (error) {
      if (error instanceof ApiError) {
        setFailure(error.message)
        // The session ran out between filling the form in and paying. Ask
        // rather than leaving them on a page that will not work.
        if (error.needsSignIn) requestSignIn('login')
      } else {
        setFailure('Something went wrong taking the payment. Try again.')
      }
    } finally {
      setProcessing(false)
    }
  }

  // `restoring` is the moment on first load when a stored token is still
  // being checked. Showing the gate then would flash "log in" at someone who
  // already is.
  if (!signedIn && !restoring) return <SignInRequired summary={summary} />

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="text-xl sm:text-2xl">Payment</h1>
      <p className="mt-1 text-sm text-ink-500">
        Choose how you would like to pay.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
          <RadioGroup
            value={method}
            onValueChange={(next) => setMethod(next as PaymentMethodId)}
            aria-label="Payment method"
            className="grid gap-3 sm:grid-cols-2"
          >
            {METHODS.map((entry) => {
              const Icon = entry.icon
              const active = method === entry.id

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
            {method === 'upi' ? (
              <TextField
                label="UPI ID"
                icon={UpiIcon}
                placeholder="yourname@bank"
                pattern="[\w.\-]{2,}@[\w]{2,}"
                title="Enter a UPI ID such as yourname@okhdfcbank"
                required
              />
            ) : null}

            {method === 'card' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Card number"
                  icon={CardIcon}
                  inputMode="numeric"
                  placeholder="0000 0000 0000 0000"
                  pattern="[0-9 ]{12,23}"
                  title="Enter a card number"
                  autoComplete="cc-number"
                  required
                  wrapperClassName="sm:col-span-2"
                />
                <TextField
                  label="Name on card"
                  icon={UserIcon}
                  placeholder="As embossed"
                  autoComplete="cc-name"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Expiry"
                    placeholder="MM/YY"
                    pattern="(0[1-9]|1[0-2])\/[0-9]{2}"
                    title="MM/YY"
                    autoComplete="cc-exp"
                    required
                  />
                  <TextField
                    label="CVV"
                    type="password"
                    inputMode="numeric"
                    placeholder="***"
                    pattern="[0-9]{3,4}"
                    title="3 or 4 digits"
                    autoComplete="cc-csc"
                    required
                  />
                </div>
              </div>
            ) : null}

            {method === 'netbanking' ? (
              <SelectField
                label="Choose your bank"
                icon={BankIcon}
                options={BANKS}
                value={bank}
                onChange={setBank}
              />
            ) : null}

            {method === 'wallet' ? (
              <SelectField
                label="Choose a wallet"
                icon={WalletIcon}
                options={WALLETS}
                value={wallet}
                onChange={setWallet}
              />
            ) : null}
          </div>

          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
            This is a front-end demo. No card, UPI or bank details are sent
            anywhere — entering real payment details is neither needed nor
            advised.
          </p>
        </section>

        <div className="lg:sticky lg:top-28 lg:self-start">
          {summary}
          <Button
            type="submit"
            fullWidth
            size="lg"
            className="mt-4"
            disabled={processing}
          >
            {processing ? (
              <>
                <SpinnerIcon className="h-5 w-5 animate-spin" />
                Processing&hellip;
              </>
            ) : (
              <>
                <LockIcon className="h-4 w-4" />
                Pay securely
              </>
            )}
          </Button>
          {processing ? (
            <p role="status" className="mt-3 text-center text-xs text-ink-500">
              Confirming your seats. Please do not close this page.
            </p>
          ) : null}

          {failure ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
            >
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{failure}</span>
            </p>
          ) : null}
        </div>
      </div>
    </form>
  )
}
