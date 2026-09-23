import { Button } from '@/components'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { InfoIcon, MapPinIcon, TicketIcon } from '@/icons'
import {
  QUOTA_LABELS,
  QUOTA_NOTES,
  formatDuration,
} from '@/services/train.services'
import type {
  BoardingStation,
  QuotaId,
  TrainClassOption,
  TrainTrip,
} from '@/types/train.types'
import { cn, formatINR } from '@/utils'

import { TrainFareSummary } from './TrainFareSummary'

const QUOTAS: QuotaId[] = ['general', 'tatkal', 'ladies', 'senior']

const AVAILABILITY_STYLE = {
  available: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  rac: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  waitlist: 'bg-red-500/12 text-red-700 dark:text-red-400',
  unavailable: 'bg-surface-muted text-ink-400',
} as const

function BoardingPicker({
  stations,
  selectedCode,
  onSelect,
}: {
  stations: BoardingStation[]
  selectedCode: string
  onSelect: (code: string) => void
}) {
  return (
    <fieldset>
      <legend className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <MapPinIcon className="h-4 w-4 text-ink-400" />
        Boarding station
      </legend>
      <p className="mt-1 text-xs text-ink-500">
        Board later down the line if it suits you. The fare does not change.
      </p>
      <RadioGroup
        value={selectedCode}
        onValueChange={onSelect}
        aria-label="Boarding station"
        className="mt-3 gap-2"
      >
        {stations.map((station) => {
          const checked = station.code === selectedCode
          return (
            <label
              key={station.code}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 transition-colors',
                checked
                  ? 'bg-brand-surface ring-brand-border'
                  : 'bg-surface-muted ring-transparent hover:ring-hairline',
              )}
            >
              <RadioGroupItem
                value={station.code}
                className="cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">
                  {station.name}
                  <span className="ml-1.5 text-xs font-bold text-ink-400">
                    {station.code}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-ink-700 tabular-nums">
                {station.time}
                {station.dayOffset > 0 ? (
                  <span className="align-super text-[0.6rem] text-brand-fg">
                    +{station.dayOffset}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}

interface StepReviewProps {
  trip: TrainTrip
  classOption: TrainClassOption
  quota: QuotaId
  boardingCode: string
  passengerCount: number
  insured: boolean
  onQuotaChange: (quota: QuotaId) => void
  onBoardingChange: (code: string) => void
  onChangeClass: (option: TrainClassOption) => void
  onContinue: () => void
}

export function StepReview({
  trip,
  classOption,
  quota,
  boardingCode,
  passengerCount,
  insured,
  onQuotaChange,
  onBoardingChange,
  onChangeClass,
  onContinue,
}: StepReviewProps) {
  const waitlisted = classOption.availability.kind === 'waitlist'

  return (
    <div>
      {/* Train recap */}
      <div className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl">
              {trip.name}
              <span className="ml-2 text-sm font-semibold text-ink-400 tabular-nums">
                #{trip.number}
              </span>
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {trip.from.name} ({trip.from.code}) &rarr; {trip.to.name} (
              {trip.to.code})
            </p>
          </div>
          <p className="text-sm font-semibold text-ink-700 tabular-nums">
            {trip.departure} &rarr; {trip.arrival}
            {trip.daysToArrive > 0 ? (
              <span className="align-super text-[0.65rem] text-brand-fg">
                +{trip.daysToArrive}
              </span>
            ) : null}
            <span className="ml-2 font-normal text-ink-400">
              ({formatDuration(trip.durationMinutes)})
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* Class */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="flex items-center gap-2 text-base">
              <TicketIcon className="h-4 w-4 text-ink-400" />
              Class
            </h2>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {trip.classes.map((option) => {
                const active = option.code === classOption.code
                const closed = option.availability.kind === 'unavailable'

                return (
                  <button
                    key={option.code}
                    type="button"
                    disabled={closed}
                    onClick={() => onChangeClass(option)}
                    className={cn(
                      'rounded-2xl p-4 text-left ring-1 transition-colors',
                      closed && 'cursor-not-allowed opacity-55 ring-hairline',
                      !closed && active
                        ? 'bg-brand-surface ring-brand-border'
                        : !closed && 'cursor-pointer ring-hairline hover:ring-brand-500',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-ink-900">
                        {option.label}
                      </span>
                      <span className="text-sm font-bold text-ink-900 tabular-nums">
                        {formatINR(option.fare)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'mt-2 inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-bold',
                        AVAILABILITY_STYLE[option.availability.kind],
                      )}
                    >
                      {option.availability.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Quota */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Quota</h2>
            <RadioGroup
              value={quota}
              onValueChange={(next) => onQuotaChange(next as QuotaId)}
              aria-label="Quota"
              className="mt-4 grid gap-2.5 sm:grid-cols-2"
            >
              {QUOTAS.map((id) => {
                const active = quota === id
                return (
                  <label
                    key={id}
                    className={cn(
                      'cursor-pointer rounded-2xl p-4 ring-1 transition-colors',
                      active
                        ? 'bg-brand-surface ring-brand-border'
                        : 'bg-surface-muted ring-transparent hover:ring-hairline',
                    )}
                  >
                    <RadioGroupItem value={id} className="sr-only" />
                    <span className="block text-sm font-bold text-ink-900">
                      {QUOTA_LABELS[id]}
                    </span>
                    <span className="mt-1 block text-xs text-ink-500">
                      {QUOTA_NOTES[id]}
                    </span>
                  </label>
                )
              })}
            </RadioGroup>
          </section>

          {/* Boarding */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <BoardingPicker
              stations={trip.boardingStations}
              selectedCode={boardingCode}
              onSelect={onBoardingChange}
            />
          </section>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <TrainFareSummary
            classOption={classOption}
            quota={quota}
            passengerCount={Math.max(1, passengerCount)}
            insured={insured}
          >
            <Button fullWidth size="lg" onClick={onContinue}>
              Continue to passengers
            </Button>
          </TrainFareSummary>

          {waitlisted ? (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/12 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              This class is waitlisted at {classOption.availability.label}. If it
              does not confirm, the ticket is cancelled automatically and the
              fare refunded.
            </p>
          ) : null}

          <p className="mt-4 flex items-start gap-2 px-1 text-xs text-ink-500">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {trip.cancellationPolicy}
          </p>
        </div>
      </div>
    </div>
  )
}
