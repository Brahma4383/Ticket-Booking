import type { ReactNode } from 'react'

import { Button, SelectField, TextField } from '@/components'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useFormValidation } from '@/hooks'
import {
  CloseIcon,
  InfoIcon,
  MailIcon,
  PhoneIcon,
  ShieldIcon,
  UserIcon,
} from '@/icons'
import type { Gender } from '@/types/common.types'
import type {
  BerthPreference,
  QuotaId,
  TrainContact,
  TrainPassenger,
} from '@/types/train.types'
import { cn } from '@/utils'
import type { FormErrors } from '@/utils/validation'
import { age, collectErrors, email, mobile, personName } from '@/utils/validation'

import { MAX_PASSENGERS } from './useTrainBooking'

const BERTH_LABELS: Record<BerthPreference, string> = {
  'no-preference': 'No preference',
  lower: 'Lower',
  middle: 'Middle',
  upper: 'Upper',
  'side-lower': 'Side lower',
  'side-upper': 'Side upper',
}

const BERTH_OPTIONS = Object.values(BERTH_LABELS)
const BERTH_IDS = Object.keys(BERTH_LABELS) as BerthPreference[]

const GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
]

/** 60 and over books as a senior citizen; the form points that out. */
const SENIOR_AGE = 60

function GenderChoice({
  value,
  locked,
  name,
  onChange,
}: {
  value: Gender
  locked: boolean
  name: string
  onChange: (gender: Gender) => void
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
 * One row of errors per passenger, keyed by the row's id, plus the contact
 * block. Mirrors what `POST /api/train/bookings/` checks.
 */
function validate({
  passengers,
  contact,
}: {
  passengers: TrainPassenger[]
  contact: TrainContact
}): FormErrors {
  return collectErrors([
    ...passengers.flatMap((passenger): Array<[string, string | null]> => [
      [`${passenger.id}.name`, personName(passenger.name, 'Full name')],
      [`${passenger.id}.age`, age(passenger.age)],
    ]),
    ['contact.email', email(contact.email)],
    ['contact.phone', mobile(contact.phone)],
  ])
}

interface StepPassengersProps {
  passengers: TrainPassenger[]
  contact: TrainContact
  quota: QuotaId
  insured: boolean
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, patch: Partial<TrainPassenger>) => void
  onContactChange: (patch: Partial<TrainContact>) => void
  onInsuredChange: (insured: boolean) => void
  onContinue: () => void
  summary: ReactNode
}

export function StepPassengers({
  passengers,
  contact,
  quota,
  insured,
  onAdd,
  onRemove,
  onChange,
  onContactChange,
  onInsuredChange,
  onContinue,
  summary,
}: StepPassengersProps) {
  const ladiesQuota = quota === 'ladies'

  const { errors, submit } = useFormValidation({ passengers, contact }, validate)

  return (
    <form onSubmit={submit(onContinue)} noValidate>
      <h1 className="text-xl sm:text-2xl">Passenger details</h1>
      <p className="mt-1 text-sm text-ink-500">
        Names must match the photo ID carried on board. Berth preference is a
        request — the railways allot berths when the chart is prepared.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {passengers.map((passenger, index) => {
            const age = Number(passenger.age)
            const senior = Number.isFinite(age) && age >= SENIOR_AGE

            return (
              <section
                key={passenger.id}
                className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base">Passenger {index + 1}</h2>
                  {passengers.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemove(passenger.id)}
                      aria-label={`Remove passenger ${index + 1}`}
                      className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px]">
                  <TextField
                    label="Full name"
                    icon={UserIcon}
                    value={passenger.name}
                    onChange={(event) =>
                      onChange(passenger.id, { name: event.target.value })
                    }
                    placeholder="As printed on your ID"
                    autoComplete="off"
                    error={errors[`${passenger.id}.name`]}
                  />
                  <TextField
                    label="Age"
                    type="number"
                    min={1}
                    max={120}
                    inputMode="numeric"
                    value={passenger.age}
                    onChange={(event) =>
                      onChange(passenger.id, { age: event.target.value })
                    }
                    placeholder="31"
                    error={errors[`${passenger.id}.age`]}
                  />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <GenderChoice
                    name={`gender-${passenger.id}`}
                    value={passenger.gender}
                    locked={ladiesQuota}
                    onChange={(gender) => onChange(passenger.id, { gender })}
                  />
                  <SelectField
                    label="Berth preference"
                    options={BERTH_OPTIONS}
                    value={BERTH_LABELS[passenger.berth]}
                    onChange={(label) =>
                      onChange(passenger.id, {
                        berth: BERTH_IDS[BERTH_OPTIONS.indexOf(label)],
                      })
                    }
                  />
                </div>

                {senior ? (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl bg-brand-surface px-4 py-2.5 text-xs text-brand-fg-strong">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    Aged {SENIOR_AGE} or above — a lower berth will be preferred
                    where one is free.
                  </p>
                ) : null}
              </section>
            )
          })}

          {passengers.length < MAX_PASSENGERS ? (
            <Button variant="secondary" fullWidth onClick={onAdd}>
              Add another passenger ({passengers.length} of {MAX_PASSENGERS})
            </Button>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2 rounded-2xl bg-brand-surface px-4 py-3 text-sm text-brand-fg-strong"
            >
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              One ticket carries at most {MAX_PASSENGERS} passengers.
            </p>
          )}

          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Contact details</h2>
            <p className="mt-1 text-sm text-ink-500">
              The ticket and any running-status updates go here.
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
                placeholder="you@example.com"
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

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-muted p-4">
              <Checkbox
                checked={insured}
                onCheckedChange={(next) => onInsuredChange(next === true)}
                className="mt-0.5 cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <ShieldIcon className="h-4 w-4 text-ink-400" />
                  Add travel insurance
                </span>
                <span className="mt-1 block text-xs text-ink-500">
                  45 paise per passenger. Covers accidental death and
                  hospitalisation during the journey.
                </span>
              </span>
            </label>
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
