import { Button } from '@/components'
import {
  CheckIcon,
  DumbbellIcon,
  HotelIcon,
  MapPinIcon,
  ParkingIcon,
  PoolIcon,
  StarIcon,
  UtensilsIcon,
  WifiIcon,
} from '@/icons'
import type { IconComponent } from '@/types/common.types'
import type { Property } from '@/types/hotel.types'
import { cn, formatINR } from '@/utils'

import { hasFreeCancellation } from './filters'

const AMENITY_ICON: Record<string, IconComponent> = {
  'Free Wi-Fi': WifiIcon,
  'Swimming pool': PoolIcon,
  'Fitness centre': DumbbellIcon,
  'Free parking': ParkingIcon,
  Restaurant: UtensilsIcon,
}

/** Booking sites word the score, not just show it. */
function scoreWord(score: number) {
  if (score >= 9) return 'Exceptional'
  if (score >= 8) return 'Excellent'
  if (score >= 7) return 'Very good'
  return 'Good'
}

export function PropertyCard({
  property,
  nights,
  onSelect,
}: {
  property: Property
  nights: number
  onSelect: () => void
}) {
  const total = property.fromPricePerNight * nights
  const freeCancellation = hasFreeCancellation(property)

  return (
    <article className="overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-hairline transition-shadow hover:shadow-lift">
      <div className="flex flex-col sm:flex-row">
        {/* Photo placeholder */}
        <div
          className={cn(
            'relative grid h-40 shrink-0 place-items-center bg-gradient-to-br sm:h-auto sm:w-48',
            property.imageAccent,
          )}
          aria-hidden="true"
        >
          <HotelIcon className="h-10 w-10 text-white/70" />
          <span className="absolute top-3 left-3 rounded-full bg-black/35 px-2.5 py-1 text-[0.7rem] font-bold text-white backdrop-blur-sm">
            {property.type}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base">
              <span className="min-w-0">{property.name}</span>
              {property.starRating > 0 ? (
                <span
                  className="inline-flex items-center gap-0.5"
                  aria-label={`${property.starRating} star`}
                >
                  {Array.from({ length: property.starRating }, (_, index) => (
                    <StarIcon
                      key={index}
                      className="h-3.5 w-3.5 text-accent-500"
                    />
                  ))}
                </span>
              ) : null}
            </h3>

            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
              <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
              {property.locality}
              <span className="text-ink-400">&middot;</span>
              {property.distanceKm} km from centre
            </p>

            <ul className="mt-3 flex flex-wrap items-center gap-2">
              {property.amenities.slice(0, 4).map((amenity) => {
                const Icon = AMENITY_ICON[amenity] ?? CheckIcon
                return (
                  <li
                    key={amenity}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {amenity}
                  </li>
                )
              })}
              {property.amenities.length > 4 ? (
                <li className="text-[0.7rem] font-semibold text-ink-400">
                  +{property.amenities.length - 4} more
                </li>
              ) : null}
            </ul>

            {freeCancellation ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckIcon className="h-3.5 w-3.5" />
                Free cancellation available
              </p>
            ) : null}
          </div>

          {/* Score + price */}
          <div className="flex items-end justify-between gap-4 lg:w-44 lg:shrink-0 lg:flex-col lg:items-end">
            <div className="flex items-center gap-2 lg:flex-row-reverse">
              <span className="grid h-9 w-11 place-items-center rounded-lg rounded-bl-none bg-brand-600 text-sm font-extrabold text-white">
                {property.reviewScore.toFixed(1)}
              </span>
              <span className="text-right lg:text-left">
                <span className="block text-xs font-bold text-ink-900">
                  {scoreWord(property.reviewScore)}
                </span>
                <span className="block text-[0.7rem] text-ink-400">
                  {property.reviewCount.toLocaleString('en-IN')} reviews
                </span>
              </span>
            </div>

            <div className="text-right">
              <p className="text-xl font-extrabold text-ink-900">
                {formatINR(property.fromPricePerNight)}
              </p>
              <p className="text-[0.7rem] text-ink-400">per night</p>
              <p className="mt-0.5 text-[0.7rem] text-ink-500">
                {formatINR(total)} for {nights} night
                {nights === 1 ? '' : 's'}
              </p>
              <Button className="mt-3 w-full" onClick={onSelect}>
                View rooms
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
