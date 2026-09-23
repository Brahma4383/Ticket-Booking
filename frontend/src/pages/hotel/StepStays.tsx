import { useEffect, useMemo, useState } from 'react'

import { Button, SelectField } from '@/components'
import { FilterIcon, HotelIcon, SortIcon } from '@/icons'
import { searchStays } from '@/services/hotel.services'
import type {
  HotelFilters,
  HotelSearchQuery,
  HotelSort,
  Property,
} from '@/types/hotel.types'
import { cn, formatLongDate } from '@/utils'

import { PropertyCard } from './PropertyCard'
import { StayFiltersPanel } from './StayFilters'
import {
  EMPTY_HOTEL_FILTERS,
  HOTEL_SORT_IDS,
  HOTEL_SORT_LABELS,
  HOTEL_SORT_OPTIONS,
  applyHotelFilters,
  sortProperties,
} from './filters'

const queryKeyOf = (query: HotelSearchQuery) =>
  `${query.city}|${query.checkIn}|${query.checkOut}|${query.guests}`

/** Stable reference, so the memo below does not re-run on every render. */
const NO_PROPERTIES: Property[] = []

function StaySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-48 animate-pulse rounded-3xl bg-surface ring-1 ring-hairline"
        />
      ))}
    </div>
  )
}

interface StepStaysProps {
  query: HotelSearchQuery
  nights: number
  onSelectProperty: (property: Property) => void
  onModifySearch: () => void
}

export function StepStays({
  query,
  nights,
  onSelectProperty,
  onModifySearch,
}: StepStaysProps) {
  const queryKey = queryKeyOf(query)

  // Results and filters carry the query they belong to, so "loading" and
  // "filters reset on a new search" are derived rather than set in an effect.
  const [results, setResults] = useState<{ key: string; list: Property[] }>({
    key: '',
    list: [],
  })
  const [filterState, setFilterState] = useState<{
    key: string
    filters: HotelFilters
  }>({ key: queryKey, filters: EMPTY_HOTEL_FILTERS })
  const [sort, setSort] = useState<HotelSort>('popular')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const loading = results.key !== queryKey
  const properties = loading ? NO_PROPERTIES : results.list
  const filters =
    filterState.key === queryKey ? filterState.filters : EMPTY_HOTEL_FILTERS

  const setFilters = (next: HotelFilters) =>
    setFilterState({ key: queryKey, filters: next })

  useEffect(() => {
    let cancelled = false

    searchStays(query).then((list) => {
      // Dates can change while a search is in flight; drop stale responses.
      if (!cancelled) setResults({ key: queryKeyOf(query), list })
    })

    return () => {
      cancelled = true
    }
  }, [query])

  const visible = useMemo(
    () => sortProperties(applyHotelFilters(properties, filters), sort),
    [properties, filters, sort],
  )

  return (
    <div>
      <div className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl">
              Stays in {query.city}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {formatLongDate(query.checkIn)} &ndash;{' '}
              {formatLongDate(query.checkOut)}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              {nights} night{nights === 1 ? '' : 's'}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              {query.guests} guest{query.guests === 1 ? '' : 's'}
              {loading ? null : (
                <>
                  <span className="mx-1.5 text-ink-400">&middot;</span>
                  {properties.length} stay
                  {properties.length === 1 ? '' : 's'}
                </>
              )}
            </p>
          </div>

          <Button variant="secondary" onClick={onModifySearch}>
            Modify search
          </Button>
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

          <StayFiltersPanel
            properties={properties}
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
                ? 'Looking for stays…'
                : `Showing ${visible.length} of ${properties.length}`}
            </p>
            <SelectField
              label="Sort by"
              icon={SortIcon}
              options={HOTEL_SORT_OPTIONS}
              value={HOTEL_SORT_LABELS[sort]}
              onChange={(label) =>
                setSort(HOTEL_SORT_IDS[HOTEL_SORT_OPTIONS.indexOf(label)])
              }
              wrapperClassName="w-60"
            />
          </div>

          {loading ? (
            <StaySkeleton />
          ) : visible.length === 0 ? (
            <div className="rounded-3xl bg-surface p-10 text-center shadow-card ring-1 ring-hairline">
              <HotelIcon className="mx-auto h-10 w-10 text-ink-400" />
              <h2 className="mt-4 text-lg">
                {properties.length === 0
                  ? 'No stays in this city'
                  : 'No stays match these filters'}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
                {properties.length === 0
                  ? 'Try a different city or a new set of dates.'
                  : 'Clear a filter or two to see more options.'}
              </p>
              <Button
                className="mt-5"
                onClick={() =>
                  properties.length === 0
                    ? onModifySearch()
                    : setFilters(EMPTY_HOTEL_FILTERS)
                }
              >
                {properties.length === 0
                  ? 'Modify search'
                  : 'Clear all filters'}
              </Button>
            </div>
          ) : (
            <ul className="space-y-4">
              {visible.map((property) => (
                <li key={property.id} className="min-w-0">
                  <PropertyCard
                    property={property}
                    nights={nights}
                    onSelect={() => onSelectProperty(property)}
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
