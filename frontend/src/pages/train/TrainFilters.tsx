import { FilterCheckboxRow, FilterGroup } from '@/components'
import { CLASS_LABELS } from '@/services/train.services'
import type { TrainClassCode, TrainFilters, TrainTrip } from '@/types/train.types'
import { cn } from '@/utils'

import {
  CLASS_CODES,
  DEPARTURE_WINDOWS,
  EMPTY_TRAIN_FILTERS,
  countActiveTrainFilters,
  hasSeats,
} from './filters'
import { clockToMinutes } from '@/services/train.services'

interface TrainFiltersPanelProps {
  trips: TrainTrip[]
  filters: TrainFilters
  onChange: (filters: TrainFilters) => void
  className?: string
}

export function TrainFiltersPanel({
  trips,
  filters,
  onChange,
  className,
}: TrainFiltersPanelProps) {
  const activeCount = countActiveTrainFilters(filters)

  const toggleClass = (code: TrainClassCode) =>
    onChange({
      ...filters,
      classes: filters.classes.includes(code)
        ? filters.classes.filter((entry) => entry !== code)
        : [...filters.classes, code],
    })

  const toggleWindow = (id: string) =>
    onChange({
      ...filters,
      departureWindows: filters.departureWindows.includes(id)
        ? filters.departureWindows.filter((entry) => entry !== id)
        : [...filters.departureWindows, id],
    })

  // Only offer classes that some train on this route actually runs.
  const availableCodes = CLASS_CODES.filter((code) =>
    trips.some((trip) => trip.classes.some((option) => option.code === code)),
  )

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
            onClick={() => onChange(EMPTY_TRAIN_FILTERS)}
            className="cursor-pointer text-xs font-bold text-brand-fg hover:underline"
          >
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <FilterGroup title="Availability">
          <FilterCheckboxRow
            label="Confirmed seats only"
            checked={filters.availableOnly}
            count={trips.filter(hasSeats).length}
            onChange={() =>
              onChange({ ...filters, availableOnly: !filters.availableOnly })
            }
          />
        </FilterGroup>

        <FilterGroup title="Class">
          {availableCodes.map((code) => (
            <FilterCheckboxRow
              key={code}
              label={CLASS_LABELS[code]}
              checked={filters.classes.includes(code)}
              count={
                trips.filter((trip) =>
                  trip.classes.some((option) => option.code === code),
                ).length
              }
              onChange={() => toggleClass(code)}
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
