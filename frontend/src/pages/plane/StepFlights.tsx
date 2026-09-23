import { useEffect, useMemo, useState } from 'react'

import { Button, SelectField } from '@/components'
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  PlaneIcon,
  SortIcon,
} from '@/icons'
import { searchFlights } from '@/services/plane.services'
import type {
  FareBrand,
  FlightTrip,
  PlaneFilters,
  PlaneSearchQuery,
  PlaneSort,
} from '@/types/plane.types'
import {
  cn,
  formatLongDate,
  isOnOrBeforeToday,
  shiftInputDate,
  toInputDate,
} from '@/utils'

import { FlightFiltersPanel } from './FlightFilters'
import { FlightResultCard } from './FlightResultCard'
import {
  EMPTY_PLANE_FILTERS,
  PLANE_SORT_IDS,
  PLANE_SORT_LABELS,
  PLANE_SORT_OPTIONS,
  applyPlaneFilters,
  sortFlights,
} from './filters'

const queryKeyOf = (query: PlaneSearchQuery) =>
  `${query.from}|${query.to}|${query.date}`

/** Stable reference, so the memo below does not re-run on every render. */
const NO_TRIPS: FlightTrip[] = []

function FlightSkeleton() {
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

interface StepFlightsProps {
  query: PlaneSearchQuery
  onQueryChange: (query: PlaneSearchQuery) => void
  onSelectFare: (trip: FlightTrip, fare: FareBrand) => void
  onModifySearch: () => void
}

export function StepFlights({
  query,
  onQueryChange,
  onSelectFare,
  onModifySearch,
}: StepFlightsProps) {
  const queryKey = queryKeyOf(query)

  // Results and filters carry the query they belong to, so "loading" and
  // "filters reset on a new search" are derived rather than set in an effect.
  const [results, setResults] = useState<{ key: string; trips: FlightTrip[] }>({
    key: '',
    trips: [],
  })
  const [filterState, setFilterState] = useState<{
    key: string
    filters: PlaneFilters
  }>({ key: queryKey, filters: EMPTY_PLANE_FILTERS })
  const [sort, setSort] = useState<PlaneSort>('departure')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const loading = results.key !== queryKey
  const trips = loading ? NO_TRIPS : results.trips
  const filters =
    filterState.key === queryKey ? filterState.filters : EMPTY_PLANE_FILTERS

  const setFilters = (next: PlaneFilters) =>
    setFilterState({ key: queryKey, filters: next })

  useEffect(() => {
    let cancelled = false

    searchFlights(query).then((trips) => {
      // The date can change while a search is in flight; drop stale responses.
      if (!cancelled) setResults({ key: queryKeyOf(query), trips })
    })

    return () => {
      cancelled = true
    }
  }, [query])

  const visible = useMemo(
    () => sortFlights(applyPlaneFilters(trips, filters), sort),
    [trips, filters, sort],
  )

  const changeDate = (days: number) => {
    const date = shiftInputDate(query.date, days)
    if (date < toInputDate()) return
    onQueryChange({ ...query, date })
  }

  return (
    <div>
      <div className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl sm:text-2xl">
              <span className="min-w-0 truncate">{query.from}</span>
              <ArrowRightIcon className="h-5 w-5 shrink-0 text-ink-400" />
              <span className="min-w-0 truncate">{query.to}</span>
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {formatLongDate(query.date)}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              {query.travellers} traveller{query.travellers === 1 ? '' : 's'}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              Economy
              {loading ? null : (
                <>
                  <span className="mx-1.5 text-ink-400">&middot;</span>
                  {trips.length} flight{trips.length === 1 ? '' : 's'}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => changeDate(-1)}
                disabled={isOnOrBeforeToday(query.date)}
                aria-label="Previous day"
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-600 transition-colors hover:bg-surface hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-bold text-ink-900 tabular-nums">
                {formatLongDate(query.date)}
              </span>
              <button
                type="button"
                onClick={() => changeDate(1)}
                aria-label="Next day"
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-600 transition-colors hover:bg-surface hover:text-ink-900"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <Button variant="secondary" onClick={onModifySearch}>
              Modify search
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div>
          <Button
            variant="secondary"
            fullWidth
            className="lg:hidden"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <FilterIcon className="h-4 w-4" />
            {filtersOpen ? 'Hide filters' : 'Show filters'}
          </Button>

          <FlightFiltersPanel
            trips={trips}
            filters={filters}
            onChange={setFilters}
            className={cn(
              'mt-3 lg:sticky lg:top-28 lg:mt-0 lg:block',
              filtersOpen ? 'block' : 'hidden',
            )}
          />
        </div>

        {/* min-w-0 stops a wide child from inflating this grid column. */}
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-500">
              {loading
                ? 'Looking for flights…'
                : `Showing ${visible.length} of ${trips.length}`}
            </p>
            <SelectField
              label="Sort by"
              icon={SortIcon}
              options={PLANE_SORT_OPTIONS}
              value={PLANE_SORT_LABELS[sort]}
              onChange={(label) =>
                setSort(PLANE_SORT_IDS[PLANE_SORT_OPTIONS.indexOf(label)])
              }
              wrapperClassName="w-60"
            />
          </div>

          {loading ? (
            <FlightSkeleton />
          ) : visible.length === 0 ? (
            <div className="rounded-3xl bg-surface p-10 text-center shadow-card ring-1 ring-hairline">
              <PlaneIcon className="mx-auto h-10 w-10 text-ink-400" />
              <h2 className="mt-4 text-lg">
                {trips.length === 0
                  ? 'No flights on this date'
                  : 'No flights match these filters'}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
                {trips.length === 0
                  ? 'Try the next day, or pick a different route.'
                  : 'Clear a filter or two to see more options.'}
              </p>
              <Button
                className="mt-5"
                onClick={() =>
                  trips.length === 0
                    ? changeDate(1)
                    : setFilters(EMPTY_PLANE_FILTERS)
                }
              >
                {trips.length === 0 ? 'Try the next day' : 'Clear all filters'}
              </Button>
            </div>
          ) : (
            <ul className="space-y-4">
              {visible.map((trip) => (
                <li key={trip.id}>
                  <FlightResultCard
                    trip={trip}
                    onSelectFare={(fare) => onSelectFare(trip, fare)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
