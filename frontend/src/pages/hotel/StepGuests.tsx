import type { ReactNode } from 'react'

import { Button, SelectField, TextField } from '@/components'
import { Textarea } from '@/components/ui/textarea'
import { useFormValidation } from '@/hooks'
import { ClockIcon, InfoIcon, MailIcon, PhoneIcon, UserIcon } from '@/icons'
import type { GuestDetails, Property, RatePlan } from '@/types/hotel.types'
import type { FormErrors } from '@/utils/validation'
import { collectErrors, email, mobile, personName } from '@/utils/validation'

const ARRIVAL_OPTIONS = [
  'I do not know yet',
  'Before 14:00',
  '14:00 – 17:00',
  '17:00 – 20:00',
  '20:00 – 23:00',
  'After 23:00',
]

/** The lead guest; mirrors what `POST /api/hotel/bookings/` checks. */
function validate(guest: GuestDetails): FormErrors {
  return collectErrors([
    ['name', personName(guest.name, 'Full name')],
    ['email', email(guest.email)],
    ['phone', mobile(guest.phone)],
    [
      'requests',
      guest.requests.length > 400
        ? 'Special requests can be at most 400 characters.'
        : null,
    ],
  ])
}

interface StepGuestsProps {
  property: Property
  ratePlan: RatePlan
  guest: GuestDetails
  guests: number
  rooms: number
  onChange: (patch: Partial<GuestDetails>) => void
  onContinue: () => void
  summary: ReactNode
}

export function StepGuests({
  property,
  ratePlan,
  guest,
  guests,
  rooms,
  onChange,
  onContinue,
  summary,
}: StepGuestsProps) {
  const { errors, submit } = useFormValidation(guest, validate)

  return (
    <form onSubmit={submit(onContinue)} noValidate>
      <h1 className="text-xl sm:text-2xl">Guest details</h1>
      <p className="mt-1 text-sm text-ink-500">
        The booking is held under the lead guest&rsquo;s name. Carry a photo ID
        for check-in.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Lead guest</h2>
            <p className="mt-1 text-sm text-ink-500">
              {rooms} room{rooms === 1 ? '' : 's'} for {guests} guest
              {guests === 1 ? '' : 's'}.
            </p>

            <div className="mt-4 grid gap-3">
              <TextField
                label="Full name"
                icon={UserIcon}
                value={guest.name}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="As printed on your ID"
                autoComplete="name"
                error={errors.name}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Email address"
                  icon={MailIcon}
                  type="email"
                  value={guest.email}
                  onChange={(event) => onChange({ email: event.target.value })}
                  placeholder="demo@gmail.com"
                  autoComplete="email"
                  error={errors.email}
                />
                <TextField
                  label="Mobile number"
                  icon={PhoneIcon}
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  value={guest.phone}
                  onChange={(event) => onChange({ phone: event.target.value })}
                  placeholder="10-digit number"
                  autoComplete="tel"
                  error={errors.phone}
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Arrival &amp; requests</h2>
            <p className="mt-1 text-sm text-ink-500">
              Check-in from {property.checkInTime}. Requests are passed on but
              cannot be guaranteed.
            </p>

            <div className="mt-4 grid gap-3">
              <SelectField
                label="Estimated arrival time"
                icon={ClockIcon}
                options={ARRIVAL_OPTIONS}
                value={guest.arrival || ARRIVAL_OPTIONS[0]}
                onChange={(arrival) => onChange({ arrival })}
              />

              <label className="block">
                <span className="block text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
                  Special requests
                </span>
                <Textarea
                  value={guest.requests}
                  onChange={(event) =>
                    onChange({ requests: event.target.value })
                  }
                  rows={3}
                  maxLength={400}
                  placeholder="High floor, late check-out, airport pickup&hellip;"
                  className="mt-2 min-h-20 w-full rounded-2xl border-0 bg-surface px-4 py-3 text-sm text-ink-900 ring-1 ring-hairline outline-none transition-shadow placeholder:text-ink-400 hover:ring-brand-border focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-brand-500 md:text-sm dark:bg-surface"
                />
                <span className="mt-1 block text-right text-[0.68rem] text-ink-400">
                  {guest.requests.length}/400
                </span>
              </label>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-xs text-ink-500">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {ratePlan.cancellationNote}.
              {ratePlan.payAtHotel
                ? ' You will settle the bill at the property.'
                : ''}
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
