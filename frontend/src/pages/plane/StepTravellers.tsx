import type { ReactNode } from 'react'

import { Button, SelectField, TextField } from '@/components'
import { useFormValidation } from '@/hooks'
import {
  CloseIcon,
  InfoIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  UserIcon,
} from '@/icons'
import type {
  FareBrand,
  FlightContact,
  FlightTraveller,
  FlightTrip,
  Title,
  TravellerType,
} from '@/types/plane.types'
import { cn, toInputDate } from '@/utils'
import type { FormErrors } from '@/utils/validation'
import {
  collectErrors,
  dateOfBirth,
  email,
  mobile,
  personName,
} from '@/utils/validation'

import { FareBrandCard } from './FareBrandCard'
import { MAX_TRAVELLERS } from './usePlaneBooking'

const TYPE_LABELS: Record<TravellerType, string> = {
  adult: 'Adult (12+ yrs)',
  child: 'Child (2–11 yrs)',
  infant: 'Infant (under 2)',
}

const TYPE_OPTIONS = Object.values(TYPE_LABELS)
const TYPE_IDS = Object.keys(TYPE_LABELS) as TravellerType[]

/** Titles offered per traveller type; children and infants get the junior set. */
const TITLES: Record<TravellerType, Title[]> = {
  adult: ['Mr', 'Ms', 'Mrs'],
  child: ['Master', 'Miss'],
  infant: ['Master', 'Miss'],
}

/**
 * One row of errors per traveller, keyed by the row's id, plus the contact
 * block. A child's or infant's date of birth is checked against the day of
 * travel, which is the airline's own reference - someone who turns 12 before
 * the flight books as an adult.
 */
function validate({
  travellers,
  contact,
  travelDate,
}: {
  travellers: FlightTraveller[]
  contact: FlightContact
  travelDate: string
}): FormErrors {
  return collectErrors([
    ...travellers.flatMap((traveller): Array<[string, string | null]> => [
      [`${traveller.id}.firstName`, personName(traveller.firstName, 'First name')],
      [`${traveller.id}.lastName`, personName(traveller.lastName, 'Last name')],
      [
        `${traveller.id}.dateOfBirth`,
        dateOfBirth(traveller.dateOfBirth, traveller.type, travelDate),
      ],
    ]),
    ['contact.email', email(contact.email)],
    ['contact.phone', mobile(contact.phone)],
  ])
}

interface StepTravellersProps {
  trip: FlightTrip
  /** `YYYY-MM-DD`; children and infants are aged against this day. */
  travelDate: string
  fareBrand: FareBrand
  travellers: FlightTraveller[]
  contact: FlightContact
  onAdd: (type: TravellerType) => void
  onRemove: (id: string) => void
  onChange: (id: string, patch: Partial<FlightTraveller>) => void
  onContactChange: (patch: Partial<FlightContact>) => void
  onChangeFare: (fare: FareBrand) => void
  onContinue: () => void
  summary: ReactNode
}

export function StepTravellers({
  trip,
  travelDate,
  fareBrand,
  travellers,
  contact,
  onAdd,
  onRemove,
  onChange,
  onContactChange,
  onChangeFare,
  onContinue,
  summary,
}: StepTravellersProps) {
  const today = toInputDate()

  const { errors, submit } = useFormValidation(
    { travellers, contact, travelDate },
    validate,
  )

  return (
    <form onSubmit={submit(onContinue)} noValidate>
      <h1 className="text-xl sm:text-2xl">Traveller details</h1>
      <p className="mt-1 text-sm text-ink-500">
        Names must match the government photo ID carried at the airport.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {travellers.map((traveller, index) => {
            const needsDob = traveller.type !== 'adult'

            return (
              <section
                key={traveller.id}
                className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base">Traveller {index + 1}</h2>
                  {travellers.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemove(traveller.id)}
                      aria-label={`Remove traveller ${index + 1}`}
                      className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[150px_110px_1fr]">
                  <SelectField
                    label="Traveller type"
                    options={TYPE_OPTIONS}
                    value={TYPE_LABELS[traveller.type]}
                    onChange={(label) => {
                      const type = TYPE_IDS[TYPE_OPTIONS.indexOf(label)]
                      onChange(traveller.id, {
                        type,
                        // Keep the title valid for the new type.
                        title: TITLES[type][0],
                      })
                    }}
                  />
                  <SelectField
                    label="Title"
                    options={TITLES[traveller.type]}
                    value={traveller.title}
                    onChange={(title) =>
                      onChange(traveller.id, { title: title as Title })
                    }
                  />
                  <TextField
                    label="First & middle name"
                    icon={UserIcon}
                    value={traveller.firstName}
                    onChange={(event) =>
                      onChange(traveller.id, { firstName: event.target.value })
                    }
                    placeholder="As on your ID"
                    autoComplete="off"
                    error={errors[`${traveller.id}.firstName`]}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Last name"
                    value={traveller.lastName}
                    onChange={(event) =>
                      onChange(traveller.id, { lastName: event.target.value })
                    }
                    placeholder="Surname"
                    autoComplete="off"
                    error={errors[`${traveller.id}.lastName`]}
                  />
                  {needsDob ? (
                    <TextField
                      label="Date of birth"
                      type="date"
                      max={today}
                      value={traveller.dateOfBirth}
                      onChange={(event) =>
                        onChange(traveller.id, {
                          dateOfBirth: event.target.value,
                        })
                      }
                      error={errors[`${traveller.id}.dateOfBirth`]}
                    />
                  ) : null}
                </div>

                {traveller.type === 'infant' ? (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl bg-brand-surface px-4 py-2.5 text-xs text-brand-fg-strong">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    Infants travel on an adult&rsquo;s lap and are not given a
                    seat of their own.
                  </p>
                ) : null}
              </section>
            )
          })}

          {travellers.length < MAX_TRAVELLERS ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPE_IDS.map((type) => (
                <Button
                  key={type}
                  variant="secondary"
                  onClick={() => onAdd(type)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add {type}
                </Button>
              ))}
            </div>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2 rounded-2xl bg-brand-surface px-4 py-3 text-sm text-brand-fg-strong"
            >
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              One booking carries at most {MAX_TRAVELLERS} travellers.
            </p>
          )}

          {/* Fare family — changeable without going back a step. */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Fare</h2>
            <p className="mt-1 text-sm text-ink-500">
              {trip.airline} {trip.airlineCode}-{trip.flightNumber}. Upgrade for
              more baggage or free changes.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {trip.fares.map((fare) => (
                <FareBrandCard
                  key={fare.id}
                  fare={fare}
                  selected={fare.id === fareBrand.id}
                  onSelect={() => onChangeFare(fare)}
                  cta="Upgrade"
                />
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Contact details</h2>
            <p className="mt-1 text-sm text-ink-500">
              The ticket and any schedule changes go here.
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
          </section>
        </div>

        <div className={cn('lg:sticky lg:top-28 lg:self-start')}>
          {summary}
          <Button type="submit" fullWidth size="lg" className="mt-4">
            Continue to seats
          </Button>
        </div>
      </div>
    </form>
  )
}
