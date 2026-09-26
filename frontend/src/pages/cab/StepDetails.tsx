import type { ReactNode } from 'react'

import { Button, DateField, TextField, TimeField } from '@/components'
import { Checkbox } from '@/components/ui/checkbox'
import { useFormValidation } from '@/hooks'
import {
  CabIcon,
  CalendarIcon,
  ClockIcon,
  InfoIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  UserIcon,
} from '@/icons'
import { ARRIVAL_BUFFER_NOTE, CAB_EXTRAS } from '@/services/cab.services'
import type {
  CabExtraId,
  CabOption,
  CabTripDetails,
} from '@/types/cab.types'
import { cn, formatINR, toInputDate } from '@/utils'
import type { FormErrors } from '@/utils/validation'
import {
  address,
  collectErrors,
  date,
  email,
  mobile,
  personName,
  time,
} from '@/utils/validation'

/**
 * Everything the driver and the dispatcher need. Mirrors what
 * `POST /api/cab/bookings/` checks; a pickup time already gone is caught
 * here rather than as a 400 after payment.
 */
function validate(details: CabTripDetails): FormErrors {
  const today = toInputDate()
  const now = new Date()
  const nowClock = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`

  return collectErrors([
    ['pickupAddress', address(details.pickupAddress, 'Pickup address')],
    ['dropAddress', address(details.dropAddress, 'Drop address')],
    ['date', date(details.date, { label: 'Pickup date', notBefore: today })],
    [
      'time',
      time(details.time, 'Pickup time') ??
        (details.date === today && details.time <= nowClock
          ? 'Pickup time has already passed today.'
          : null),
    ],
    ['name', personName(details.name, 'Full name')],
    ['phone', mobile(details.phone)],
    ['email', email(details.email)],
  ])
}

interface StepDetailsProps {
  option: CabOption
  details: CabTripDetails
  extras: CabExtraId[]
  onChange: (patch: Partial<CabTripDetails>) => void
  onToggleExtra: (extra: CabExtraId) => void
  onContinue: () => void
  summary: ReactNode
}

export function StepDetails({
  option,
  details,
  extras,
  onChange,
  onToggleExtra,
  onContinue,
  summary,
}: StepDetailsProps) {
  const { errors, submit } = useFormValidation(details, validate)

  return (
    <form onSubmit={submit(onContinue)} noValidate>
      <h1 className="text-xl sm:text-2xl">Trip details</h1>
      <p className="mt-1 text-sm text-ink-500">
        The driver calls this number before pickup, so give the exact address.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {/* Chosen cab */}
          <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
              <CabIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-ink-900">
                {option.name}
              </span>
              <span className="block truncate text-xs text-ink-400">
                {option.models}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-lg font-extrabold text-ink-900">
                {formatINR(option.baseFare)}
              </span>
              <span className="block text-[0.7rem] text-ink-400">
                {option.includedKm} km included
              </span>
            </span>
          </section>

          {/* Addresses */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Pickup &amp; drop</h2>

            <div className="mt-4 grid gap-3">
              <TextField
                label="Pickup address"
                icon={MapPinIcon}
                value={details.pickupAddress}
                onChange={(event) =>
                  onChange({ pickupAddress: event.target.value })
                }
                placeholder="Flat, building, street, landmark"
                autoComplete="off"
                error={errors.pickupAddress}
              />
              <TextField
                label="Drop address"
                icon={MapPinIcon}
                value={details.dropAddress}
                onChange={(event) =>
                  onChange({ dropAddress: event.target.value })
                }
                placeholder="Flat, building, street, landmark"
                autoComplete="off"
                error={errors.dropAddress}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <DateField
                  label="Pickup date"
                  icon={CalendarIcon}
                  min={toInputDate()}
                  value={details.date}
                  onChange={(date) => onChange({ date })}
                  error={errors.date}
                />
                <TimeField
                  label="Pickup time"
                  icon={ClockIcon}
                  value={details.time}
                  onChange={(time) => onChange({ time })}
                  error={errors.time}
                />
              </div>
            </div>
          </section>

          {/* Extras */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Extras</h2>
            <p className="mt-1 text-sm text-ink-500">
              Added to the fare and arranged before pickup.
            </p>

            <div className="mt-4 space-y-2.5">
              {CAB_EXTRAS.map((extra) => {
                const checked = extras.includes(extra.id)
                return (
                  <label
                    key={extra.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 transition-colors',
                      checked
                        ? 'bg-brand-surface ring-brand-border'
                        : 'bg-surface-muted ring-transparent hover:ring-hairline',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleExtra(extra.id)}
                      className="mt-0.5 cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-900">
                        {extra.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {extra.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-ink-900 tabular-nums">
                      {formatINR(extra.price)}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          {/* Contact */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Contact details</h2>

            <div className="mt-4 grid gap-3">
              <TextField
                label="Full name"
                icon={UserIcon}
                value={details.name}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="Passenger name"
                autoComplete="name"
                error={errors.name}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Mobile number"
                  icon={PhoneIcon}
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  value={details.phone}
                  onChange={(event) => onChange({ phone: event.target.value })}
                  placeholder="10-digit number"
                  autoComplete="tel"
                  error={errors.phone}
                />
                <TextField
                  label="Email address"
                  icon={MailIcon}
                  type="email"
                  value={details.email}
                  onChange={(event) => onChange({ email: event.target.value })}
                  placeholder="demo@gmail.com"
                  autoComplete="email"
                  error={errors.email}
                />
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {ARRIVAL_BUFFER_NOTE}
            </p>
          </section>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          {summary}
          <Button type="submit" fullWidth size="lg" className="mt-4">
            Continue to payment
          </Button>
        </div>
      </div>
    </form>
  )
}
