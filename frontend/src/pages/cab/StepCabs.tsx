import { useEffect, useState } from 'react'

import { Button } from '@/components'
import {
  ArrowRightIcon,
  CabIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  LuggageIcon,
  MoonStarsIcon,
  RouteIcon,
  SnowflakeIcon,
  StarIcon,
  UsersIcon,
} from '@/icons'
import {
  TRIP_TYPE_LABELS,
  formatDuration,
  searchCabs,
} from '@/services/cab.services'
import type {
  CabOption,
  CabSearchQuery,
  TripEstimate,
} from '@/types/cab.types'
import { formatINR, formatLongDate } from '@/utils'

/** Stable reference, so nothing re-runs on every render. */
const NO_OPTIONS: CabOption[] = []

function CabSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-3xl bg-surface ring-1 ring-hairline"
        />
      ))}
    </div>
  )
}

function OptionCard({
  option,
  onSelect,
}: {
  option: CabOption
  onSelect: () => void
}) {
  return (
    <article className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline transition-shadow hover:shadow-lift sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-4">
        <div className="flex items-center gap-3 md:w-52 md:shrink-0">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
            <CabIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-ink-900">
              {option.name}
            </span>
            <span className="block truncate text-xs text-ink-400">
              {option.models}
            </span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <ul className="flex flex-wrap items-center gap-2">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
              <UsersIcon className="h-3.5 w-3.5" />
              {option.seats} seats
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
              <LuggageIcon className="h-3.5 w-3.5" />
              {option.luggage} bags
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
              <SnowflakeIcon className="h-3.5 w-3.5" />
              AC
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-surface px-2.5 py-1 text-[0.7rem] font-bold text-brand-fg-strong">
              <StarIcon className="h-3.5 w-3.5" />
              {option.rating.toFixed(1)}
            </li>
          </ul>

          <ul className="mt-3 space-y-1">
            {option.inclusions.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-xs text-ink-600"
              >
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {item}
              </li>
            ))}
            {option.exclusions.slice(0, 2).map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-xs text-ink-400"
              >
                <CloseIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item} extra
              </li>
            ))}
          </ul>
        </div>

        <div className="md:w-40 md:shrink-0 md:text-right">
          <p className="text-2xl font-extrabold text-ink-900">
            {formatINR(option.baseFare)}
          </p>
          <p className="text-[0.7rem] text-ink-400">
            then {formatINR(option.extraKmRate)}/km
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-500">
            <ClockIcon className="h-3.5 w-3.5" />
            {option.etaMinutes} min away
          </p>
          <Button className="mt-3 w-full md:w-auto" onClick={onSelect}>
            Select
          </Button>
        </div>
      </div>

      <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-500">
        {option.cancellation}
      </p>
    </article>
  )
}

interface StepCabsProps {
  query: CabSearchQuery
  /** Null while the server works the trip out. */
  estimate: TripEstimate | null
  onSelectOption: (option: CabOption) => void
  onModifySearch: () => void
}

export function StepCabs({
  query,
  estimate,
  onSelectOption,
  onModifySearch,
}: StepCabsProps) {
  const routeKey = `${query.pickup}|${query.drop}|${query.date}`

  // Tagging results with the route they belong to lets "loading" be derived
  // during render, instead of flipping a flag from inside the effect.
  const [results, setResults] = useState<{ key: string; list: CabOption[] }>({
    key: '',
    list: [],
  })
  const loading = results.key !== routeKey
  const options = loading ? NO_OPTIONS : results.list

  useEffect(() => {
    let cancelled = false

    searchCabs(query).then((list) => {
      if (!cancelled) {
        setResults({
          key: `${query.pickup}|${query.drop}|${query.date}`,
          list,
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [query])

  return (
    <div>
      <div className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl sm:text-2xl">
              <span className="min-w-0">{query.pickup}</span>
              <ArrowRightIcon className="h-5 w-5 shrink-0 text-ink-400" />
              <span className="min-w-0">{query.drop}</span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-500">
              <span>
                {estimate ? TRIP_TYPE_LABELS[estimate.tripType] : 'Working out the route'}
              </span>
              <span className="text-ink-400">&middot;</span>
              {formatLongDate(query.date)} at {query.time}
              {estimate?.nightTrip ? (
                <span className="inline-flex items-center gap-1 text-ink-500">
                  <MoonStarsIcon className="h-3.5 w-3.5" />
                  night trip
                </span>
              ) : null}
            </p>
          </div>

          <Button variant="secondary" onClick={onModifySearch}>
            Modify search
          </Button>
        </div>

        {/* Route estimate */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-4 text-sm">
          <span className="inline-flex items-center gap-2 text-ink-600">
            <RouteIcon className="h-4 w-4 text-ink-400" />
            <span className="font-bold text-ink-900">
              {estimate ? `${estimate.distanceKm} km` : '—'}
            </span>
            approximate distance
          </span>
          <span className="inline-flex items-center gap-2 text-ink-600">
            <ClockIcon className="h-4 w-4 text-ink-400" />
            <span className="font-bold text-ink-900">
              {estimate ? formatDuration(estimate.durationMinutes) : '—'}
            </span>
            typical driving time
          </span>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-sm text-ink-500">
          {loading ? 'Finding cabs…' : `${options.length} cabs available`}
        </h2>

        {loading ? (
          <CabSkeleton />
        ) : (
          <ul className="space-y-4">
            {options.map((option) => (
              <li key={option.id} className="min-w-0">
                <OptionCard
                  option={option}
                  onSelect={() => onSelectOption(option)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
