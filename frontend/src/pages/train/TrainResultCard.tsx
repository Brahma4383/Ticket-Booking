import { CheckIcon, DropletIcon, StarIcon } from '@/icons'
import { formatDuration } from '@/services/train.services'
import type { TrainClassOption, TrainTrip } from '@/types/train.types'
import { cn, formatINR } from '@/utils'

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Availability colours: green confirmed, amber RAC, red waitlisted. */
const AVAILABILITY_STYLE = {
  available: 'text-emerald-600 dark:text-emerald-400',
  rac: 'text-amber-600 dark:text-amber-400',
  waitlist: 'text-red-600 dark:text-red-400',
  unavailable: 'text-ink-400',
} as const

function ClassChip({
  option,
  onSelect,
}: {
  option: TrainClassOption
  onSelect: () => void
}) {
  const { availability } = option
  const closed = availability.kind === 'unavailable'

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={closed}
      aria-label={`${option.label}, ${formatINR(option.fare)}, ${availability.label}`}
      className={cn(
        'min-w-[8.5rem] rounded-2xl px-4 py-3 text-left ring-1 transition-all',
        closed
          ? 'cursor-not-allowed bg-surface-muted ring-hairline opacity-60'
          : 'cursor-pointer bg-surface ring-hairline hover:-translate-y-0.5 hover:shadow-card hover:ring-brand-500',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink-900">{option.code}</span>
        <span className="text-sm font-bold text-ink-900 tabular-nums">
          {formatINR(option.fare)}
        </span>
      </span>
      <span
        className={cn(
          'mt-1 block text-xs font-bold',
          AVAILABILITY_STYLE[availability.kind],
        )}
      >
        {availability.label}
      </span>
      {availability.kind === 'rac' || availability.kind === 'waitlist' ? (
        <span className="mt-0.5 block text-[0.68rem] text-ink-400">
          {availability.confirmChance}% chance of confirming
        </span>
      ) : null}
    </button>
  )
}

export function TrainResultCard({
  trip,
  onSelectClass,
}: {
  trip: TrainTrip
  onSelectClass: (option: TrainClassOption) => void
}) {
  return (
    <article className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline transition-shadow hover:shadow-lift sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base">
            {trip.name}
            <span className="ml-2 text-sm font-semibold text-ink-400 tabular-nums">
              #{trip.number}
            </span>
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* Running days, as the railways print them. */}
            <ul className="flex gap-1" aria-label="Runs on">
              {DAY_LETTERS.map((letter, index) => (
                <li
                  key={`${letter}-${index}`}
                  title={trip.runsOn[index] ? 'Runs' : 'Does not run'}
                  className={cn(
                    'grid h-5 w-5 place-items-center rounded text-[0.6rem] font-bold',
                    trip.runsOn[index]
                      ? 'bg-brand-surface text-brand-fg-strong'
                      : 'bg-surface-muted text-ink-400 line-through',
                  )}
                >
                  {letter}
                </li>
              ))}
            </ul>

            {trip.pantry ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                <DropletIcon className="h-3.5 w-3.5" />
                Pantry car
              </span>
            ) : null}
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full bg-brand-surface px-2.5 py-1 text-xs font-bold text-brand-fg-strong">
          <StarIcon className="h-3.5 w-3.5" />
          {trip.rating.toFixed(1)}
        </span>
      </div>

      {/* Timings */}
      <div className="mt-5 flex items-center gap-4">
        <div>
          <p className="text-xl font-extrabold text-ink-900 tabular-nums">
            {trip.departure}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {trip.from.code} &middot; {trip.from.name}
          </p>
        </div>

        <div className="flex-1">
          <p className="text-center text-[0.7rem] font-semibold text-ink-400">
            {formatDuration(trip.durationMinutes)}
          </p>
          <div className="relative mt-1 h-px w-full bg-hairline">
            <span className="absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-ink-400" />
            <span className="absolute -top-[3px] right-0 h-[7px] w-[7px] rounded-full bg-ink-400" />
          </div>
        </div>

        <div className="text-right">
          <p className="text-xl font-extrabold text-ink-900 tabular-nums">
            {trip.arrival}
            {trip.daysToArrive > 0 ? (
              <span className="ml-1 align-super text-[0.65rem] font-bold text-brand-fg">
                +{trip.daysToArrive}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {trip.to.code} &middot; {trip.to.name}
          </p>
        </div>
      </div>

      {/* Classes */}
      <div className="mt-5 border-t border-hairline pt-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-500">
          <CheckIcon className="h-3.5 w-3.5" />
          Pick a class to continue
        </p>
        <ul className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {trip.classes.map((option) => (
            <li key={option.code} className="shrink-0">
              <ClassChip
                option={option}
                onSelect={() => onSelectClass(option)}
              />
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
