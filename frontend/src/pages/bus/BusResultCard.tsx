import { useState } from 'react'

import { Button } from '@/components'
import {
  ArmchairIcon,
  BoltIcon,
  CheckIcon,
  DropletIcon,
  HotelIcon,
  PlugIcon,
  ShieldIcon,
  SnowflakeIcon,
  StarIcon,
  WifiIcon,
} from '@/icons'
import type { IconComponent } from '@/types/common.types'
import type { BusTrip } from '@/types/bus.types'
import { formatDuration } from '@/services/bus.services'
import { cn, formatINR } from '@/utils'

const AMENITY_ICON: Record<string, IconComponent> = {
  'Wi-Fi': WifiIcon,
  'Charging point': PlugIcon,
  'Water bottle': DropletIcon,
  'Track my bus': BoltIcon,
  CCTV: ShieldIcon,
}

export function BusResultCard({
  trip,
  onSelect,
}: {
  trip: BusTrip
  onSelect: () => void
}) {
  const [showStops, setShowStops] = useState(false)
  const KindIcon = trip.kind === 'sleeper' ? HotelIcon : ArmchairIcon
  const almostFull = trip.seatsLeft <= 5

  return (
    <article className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline transition-shadow hover:shadow-lift sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-4 xl:gap-5">
        {/* Operator + coach */}
        <div className="min-w-0 md:w-44 md:shrink-0 xl:w-56">
          <h3 className="truncate text-base">{trip.operator}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
            <KindIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {trip.airConditioned ? 'A/C' : 'Non A/C'}{' '}
              {trip.kind === 'sleeper' ? 'Sleeper' : 'Seater'} ({trip.layout})
            </span>
          </p>
          <p className="mt-1 truncate text-xs text-ink-400">{trip.coach}</p>
        </div>

        {/* Timings */}
        <div className="flex min-w-0 flex-1 items-center gap-3 xl:gap-4">
          <div>
            <p className="text-xl font-extrabold text-ink-900 tabular-nums">
              {trip.departure}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">Departs</p>
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
              {trip.arrivesNextDay ? (
                <span className="ml-1 align-super text-[0.65rem] font-bold text-brand-fg">
                  +1
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">Arrives</p>
          </div>
        </div>

        {/* Rating */}
        <div className="md:w-20 md:shrink-0 md:text-center xl:w-24">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-surface px-2.5 py-1 text-xs font-bold text-brand-fg-strong">
            <StarIcon className="h-3.5 w-3.5" />
            {trip.rating.toFixed(1)}
          </span>
          <p className="mt-1 text-[0.7rem] text-ink-400">
            {trip.ratingCount.toLocaleString('en-IN')} ratings
          </p>
        </div>

        {/* Fare + CTA */}
        <div className="md:w-36 md:shrink-0 md:text-right xl:w-40">
          <p className="text-[0.7rem] text-ink-400">from</p>
          <p className="text-2xl font-extrabold text-ink-900">
            {formatINR(trip.fareFrom)}
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs font-semibold',
              almostFull ? 'text-accent-600' : 'text-ink-500',
            )}
          >
            {trip.seatsLeft} seat{trip.seatsLeft === 1 ? '' : 's'} left
          </p>
          <Button className="mt-3 w-full md:w-auto" onClick={onSelect}>
            Select seats
          </Button>
        </div>
      </div>

      {/* Amenities */}
      <ul className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        {trip.airConditioned ? (
          <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
            <SnowflakeIcon className="h-3.5 w-3.5" />
            Air conditioned
          </li>
        ) : null}
        {trip.amenities.map((amenity) => {
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

        <li className="ml-auto">
          <button
            type="button"
            onClick={() => setShowStops((open) => !open)}
            aria-expanded={showStops}
            className="inline-flex min-h-8 cursor-pointer items-center rounded-full px-2.5 text-[0.7rem] font-bold text-brand-fg transition-colors hover:underline"
          >
            {showStops ? 'Hide' : 'Boarding & dropping points'}
          </button>
        </li>
      </ul>

      {showStops ? (
        <div className="mt-4 grid gap-5 rounded-2xl bg-surface-muted p-4 sm:grid-cols-2">
          {[
            { title: 'Boarding points', points: trip.boardingPoints },
            { title: 'Dropping points', points: trip.droppingPoints },
          ].map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-bold tracking-wide text-ink-500 uppercase">
                {group.title}
              </h4>
              <ul className="mt-2.5 space-y-2">
                {group.points.map((point) => (
                  <li key={point.id} className="flex gap-3 text-xs">
                    <span className="w-11 shrink-0 font-bold text-ink-900 tabular-nums">
                      {point.time}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-700">
                        {point.name}
                      </span>
                      <span className="block text-ink-400">
                        {point.landmark}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-ink-500 sm:col-span-2">
            <span className="font-semibold text-ink-700">Cancellation:</span>{' '}
            {trip.cancellationPolicy}
          </p>
        </div>
      ) : null}
    </article>
  )
}
