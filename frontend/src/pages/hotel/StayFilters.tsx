import { FilterCheckboxRow, FilterGroup } from '@/components'
import { Slider } from '@/components/ui/slider'
import { StarIcon } from '@/icons'
import type { HotelFilters, Property, PropertyType } from '@/types/hotel.types'
import { cn, formatINR } from '@/utils'

import {
  EMPTY_HOTEL_FILTERS,
  HOTEL_AMENITIES,
  PROPERTY_TYPES,
  STAR_OPTIONS,
  countActiveHotelFilters,
  hasFreeCancellation,
} from './filters'

export function StayFiltersPanel({
  properties,
  filters,
  onChange,
  className,
}: {
  properties: Property[]
  filters: HotelFilters
  onChange: (filters: HotelFilters) => void
  className?: string
}) {
  const activeCount = countActiveHotelFilters(filters)

  // The slider spans the actual price range on this search.
  const prices = properties.map((p) => p.fromPricePerNight)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0
  const currentMax = filters.maxPricePerNight ?? maxPrice

  const toggle = <K extends 'types' | 'amenities'>(
    key: K,
    value: K extends 'types' ? PropertyType : string,
  ) => {
    const current = filters[key] as string[]
    onChange({
      ...filters,
      [key]: current.includes(value as string)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    })
  }

  const toggleStar = (star: number) =>
    onChange({
      ...filters,
      stars: filters.stars.includes(star)
        ? filters.stars.filter((entry) => entry !== star)
        : [...filters.stars, star],
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
            onClick={() => onChange(EMPTY_HOTEL_FILTERS)}
            className="cursor-pointer text-xs font-bold text-brand-fg hover:underline"
          >
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        {maxPrice > minPrice ? (
          <FilterGroup title="Price per night">
            <div>
              <span className="flex items-center justify-between text-xs text-ink-500">
                <span>{formatINR(minPrice)}</span>
                <span className="font-bold text-ink-900">
                  up to {formatINR(currentMax)}
                </span>
              </span>
              <Slider
                min={minPrice}
                max={maxPrice}
                step={100}
                value={[currentMax]}
                onValueChange={([next]) =>
                  onChange({ ...filters, maxPricePerNight: next })
                }
                aria-label="Maximum price per night"
                className="mt-3 cursor-pointer *:data-[slot=slider-track]:h-1.5 *:data-[slot=slider-track]:bg-surface-muted"
              />
            </div>
          </FilterGroup>
        ) : null}

        <FilterGroup title="Popular">
          <FilterCheckboxRow
            label="Free cancellation"
            checked={filters.freeCancellationOnly}
            count={properties.filter(hasFreeCancellation).length}
            onChange={() =>
              onChange({
                ...filters,
                freeCancellationOnly: !filters.freeCancellationOnly,
              })
            }
          />
        </FilterGroup>

        <FilterGroup title="Property type">
          {PROPERTY_TYPES.filter((type) =>
            properties.some((property) => property.type === type),
          ).map((type) => (
            <FilterCheckboxRow
              key={type}
              label={type}
              checked={filters.types.includes(type)}
              count={properties.filter((p) => p.type === type).length}
              onChange={() => toggle('types', type)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Star rating">
          {STAR_OPTIONS.filter((star) =>
            properties.some((property) => property.starRating === star),
          ).map((star) => (
            <FilterCheckboxRow
              key={star}
              label={
                <span className="inline-flex items-center gap-1">
                  {Array.from({ length: star }, (_, index) => (
                    <StarIcon
                      key={index}
                      className="h-3.5 w-3.5 text-accent-500"
                    />
                  ))}
                </span>
              }
              checked={filters.stars.includes(star)}
              count={properties.filter((p) => p.starRating === star).length}
              onChange={() => toggleStar(star)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Amenities">
          {HOTEL_AMENITIES.filter((amenity) =>
            properties.some((property) => property.amenities.includes(amenity)),
          ).map((amenity) => (
            <FilterCheckboxRow
              key={amenity}
              label={amenity}
              checked={filters.amenities.includes(amenity)}
              count={
                properties.filter((p) => p.amenities.includes(amenity)).length
              }
              onChange={() => toggle('amenities', amenity)}
            />
          ))}
        </FilterGroup>
      </div>
    </aside>
  )
}
