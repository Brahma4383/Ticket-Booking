import type { ReactNode } from 'react'

import { Button, TextField } from '@/components'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useFormValidation } from '@/hooks'
import { InfoIcon, MailIcon, PhoneIcon, UserIcon } from '@/icons'
import type { ContactDetails, Passenger, Seat } from '@/types/bus.types'
import type { Gender } from '@/types/common.types'
import { cn } from '@/utils'
import type { FormErrors } from '@/utils/validation'
import { age, collectErrors, email, mobile, personName } from '@/utils/validation'

const GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
]

function GenderChoice({
  value,
  locked,
  onChange,
  name,
}: {
  value: Gender
  locked: boolean
  onChange: (gender: Gender) => void
  name: string
}) {
  return (
    <fieldset>
      <legend className="block text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase">
        Gender
      </legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as Gender)}
        name={name}
        className="mt-2 flex gap-2"
      >
        {GENDERS.map((gender) => {
          const checked = value === gender.id
          const disabled = locked && gender.id !== 'female'

          return (
            <label
              key={gender.id}
              className={cn(
                'flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold ring-1 transition-colors',
                checked
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-surface text-ink-600 ring-hairline',
                disabled
                  ? 'cursor-not-allowed opacity-45'
                  : 'cursor-pointer hover:ring-brand-border',
              )}
            >
              <RadioGroupItem
                value={gender.id}
                disabled={disabled}
                className="sr-only"
              />
              {gender.label}
            </label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}

/**
 * One row of errors per passenger, keyed by seat so a row can find its own,
 * plus the contact block. Mirrors what `POST /api/bus/bookings/` checks.
 */
function validate({
  passengers,
  contact,
}: {
  passengers: Passenger[]
  contact: ContactDetails
}): FormErrors {
  return collectErrors([
    ...passengers.flatMap((passenger): Array<[string, string | null]> => [
      [`${passenger.seatId}.name`, personName(passenger.name, 'Full name')],
      [`${passenger.seatId}.age`, age(passenger.age)],
    ]),
    ['contact.email', email(contact.email)],
    ['contact.phone', mobile(contact.phone)],
  ])
}

interface StepPassengersProps {
  seats: Seat[]
  passengers: Passenger[]
  contact: ContactDetails
  onPassengerChange: (seatId: string, patch: Partial<Passenger>) => void
  onContactChange: (patch: Partial<ContactDetails>) => void
  onContinue: () => void
  summary: ReactNode
}

export function StepPassengers({
  seats,
  passengers,
  contact,
  onPassengerChange,
  onContactChange,
  onContinue,
  summary,
}: StepPassengersProps) {
  const { errors, submit } = useFormValidation({ passengers, contact }, validate)

  return (
    <form onSubmit={submit(onContinue)} noValidate>
      <h1 className="text-xl sm:text-2xl">Traveller details</h1>
      <p className="mt-1 text-sm text-ink-500">
        Names must match the photo ID carried on board.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {passengers.map((passenger, index) => {
            const seat = seats.find((entry) => entry.id === passenger.seatId)
            const ladiesOnly = seat?.status === 'ladies'

            return (
              <section
                key={passenger.seatId}
                className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base">Passenger {index + 1}</h2>
                  <span className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-ink-600">
                    Seat {passenger.seatId}
                    <span className="font-normal text-ink-400 capitalize">
                      {seat?.deck} deck
                    </span>
                  </span>
                </div>

                {ladiesOnly ? (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl bg-pink-500/10 px-4 py-2.5 text-xs text-pink-700 dark:text-pink-300">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    Seat {passenger.seatId} is reserved for women travellers, so
                    the gender is fixed for this passenger.
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]">
                  <TextField
                    label="Full name"
                    icon={UserIcon}
                    value={passenger.name}
                    onChange={(event) =>
                      onPassengerChange(passenger.seatId, {
                        name: event.target.value,
                      })
                    }
                    placeholder="As printed on your ID"
                    autoComplete="off"
                    error={errors[`${passenger.seatId}.name`]}
                  />
                  <TextField
                    label="Age"
                    type="number"
                    min={1}
                    max={120}
                    inputMode="numeric"
                    value={passenger.age}
                    onChange={(event) =>
                      onPassengerChange(passenger.seatId, {
                        age: event.target.value,
                      })
                    }
                    placeholder="28"
                    error={errors[`${passenger.seatId}.age`]}
                  />
                </div>

                <div className="mt-4">
                  <GenderChoice
                    name={`gender-${passenger.seatId}`}
                    value={passenger.gender}
                    locked={ladiesOnly}
                    onChange={(gender) =>
                      onPassengerChange(passenger.seatId, { gender })
                    }
                  />
                </div>
              </section>
            )
          })}

          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Contact details</h2>
            <p className="mt-1 text-sm text-ink-500">
              The ticket and any trip updates go here.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Email address"
                icon={MailIcon}
                type="email"
                value={contact.email}
                onChange={(event) =>
                  onContactChange({ email: event.target.value })
                }
                placeholder="demo@gmail.com"
                autoComplete="email"
                error={errors['contact.email']}
              />
              <TextField
                label="Mobile number"
                icon={PhoneIcon}
                type="tel"
                inputMode="numeric"
                maxLength={12}
                value={contact.phone}
                onChange={(event) =>
                  onContactChange({ phone: event.target.value })
                }
                placeholder="10-digit number"
                autoComplete="tel"
                error={errors['contact.phone']}
              />
            </div>
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
