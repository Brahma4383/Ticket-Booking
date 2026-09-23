import { FilterCheckboxRow, FilterGroup } from '@/components'
import { clockToMinutes } from '@/services/plane.services'
import type { FlightTrip, PlaneFilters } from '@/types/plane.types'
import { cn } from '@/utils'

import {
  DEPARTURE_WINDOWS,
  EMPTY_PLANE_FILTERS,
  STOP_OPTIONS,
  countActivePlaneFilters,
} from './filters'

export function FlightFiltersPanel({
  trips,
  filters,
  onChange,
  className,
}: {
  trips: FlightTrip[]
  filters: PlaneFilters
  onChange: (filters: PlaneFilters) => void
  className?: string
}) {
  const activeCount = countActivePlaneFilters(filters)
  const airlines = [...new Set(trips.map((trip) => trip.airline))].sort()

  const toggleStop = (value: number) =>
    onChange({
      ...filters,
      stops: filters.stops.includes(value)
        ? filters.stops.filter((entry) => entry !== value)
        : [...filters.stops, value],
    })

  const toggleAirline = (airline: string) =>
    onChange({
      ...filters,
      airlines: filters.airlines.includes(airline)
        ? filters.airlines.filter((entry) => entry !== airline)
        : [...filters.airlines, airline],
    })

  const toggleWindow = (id: string) =>
    onChange({
      ...filters,
      departureWindows: filters.departureWindows.includes(id)
        ? filters.departureWindows.filter((entry) => entry !== id)
        : [...filters.departureWindows, id],
    })

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
            onClick={() => onChange(EMPTY_PLANE_FILTERS)}
            className="cursor-pointer text-xs font-bold text-brand-fg hover:underline"
          >
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <FilterGroup title="Stops">
          {STOP_OPTIONS.map((option) => (
            <FilterCheckboxRow
              key={option.value}
              label={option.label}
              checked={filters.stops.includes(option.value)}
              count={
                trips.filter((trip) =>
                  option.value === 2
                    ? trip.stops.length >= 2
                    : trip.stops.length === option.value,
                ).length
              }
              onChange={() => toggleStop(option.value)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Airline">
          {airlines.map((airline) => (
            <FilterCheckboxRow
              key={airline}
              label={airline}
              checked={filters.airlines.includes(airline)}
              count={trips.filter((trip) => trip.airline === airline).length}
              onChange={() => toggleAirline(airline)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Departure time">
          {DEPARTURE_WINDOWS.map((window) => (
            <FilterCheckboxRow
              key={window.id}
              label={window.label}
              checked={filters.departureWindows.includes(window.id)}
              count={
                trips.filter((trip) => {
                  const minutes = clockToMinutes(trip.departure)
                  return minutes >= window.from && minutes <= window.to
                }).length
              }
              onChange={() => toggleWindow(window.id)}
            />
          ))}
        </FilterGroup>
      </div>
    </aside>
  )
}
