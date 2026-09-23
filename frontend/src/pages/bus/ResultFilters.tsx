import { FilterCheckboxRow, FilterGroup } from '@/components'
import type { BusFilters, BusTrip } from '@/types/bus.types'
import { cn } from '@/utils'

import {
  COACH_TYPES,
  DEPARTURE_WINDOWS,
  EMPTY_FILTERS,
  countActiveFilters,
  departureMinutes,
  matchesCoachType,
} from './filters'

interface ResultFiltersProps {
  trips: BusTrip[]
  filters: BusFilters
  onChange: (filters: BusFilters) => void
  className?: string
}

export function ResultFilters({
  trips,
  filters,
  onChange,
  className,
}: ResultFiltersProps) {
  const operators = [...new Set(trips.map((trip) => trip.operator))].sort()
  const activeCount = countActiveFilters(filters)

  const toggle = (key: keyof BusFilters, value: string) => {
    const current = filters[key]
    onChange({
      ...filters,
      [key]: current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    })
  }

  const countFor = (predicate: (trip: BusTrip) => boolean) =>
    trips.filter(predicate).length

  return (
    <aside
      className={cn(
        'overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-hairline',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-base">Filters</h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="cursor-pointer text-xs font-bold text-brand-fg hover:underline"
          >
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <FilterGroup title="Bus type">
          {COACH_TYPES.map((type) => (
            <FilterCheckboxRow
              key={type}
              label={type}
              checked={filters.coachTypes.includes(type)}
              count={countFor((trip) => matchesCoachType(trip, [type]))}
              onChange={() => toggle('coachTypes', type)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Departure time">
          {DEPARTURE_WINDOWS.map((window) => (
            <FilterCheckboxRow
              key={window.id}
              label={window.label}
              checked={filters.departureWindows.includes(window.id)}
              count={countFor((trip) => {
                const minutes = departureMinutes(trip)
                return minutes >= window.from && minutes <= window.to
              })}
              onChange={() => toggle('departureWindows', window.id)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Operator">
          <div className="max-h-56 overflow-y-auto pr-1">
            {operators.map((operator) => (
              <FilterCheckboxRow
                key={operator}
                label={operator}
                checked={filters.operators.includes(operator)}
                count={countFor((trip) => trip.operator === operator)}
                onChange={() => toggle('operators', operator)}
              />
            ))}
          </div>
        </FilterGroup>
      </div>
    </aside>
  )
}
