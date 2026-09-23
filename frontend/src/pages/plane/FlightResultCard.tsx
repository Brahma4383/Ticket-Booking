import { useState } from 'react'

import { Button } from '@/components'
import { ClockIcon, PlaneIcon } from '@/icons'
import { describeStops, formatDuration } from '@/services/plane.services'
import type { FareBrand, FlightTrip } from '@/types/plane.types'
import { cn, formatINR } from '@/utils'

import { FareBrandCard } from './FareBrandCard'

export function FlightResultCard({
  trip,
  onSelectFare,
}: {
  trip: FlightTrip
  onSelectFare: (fare: FareBrand) => void
}) {
  const [showFares, setShowFares] = useState(false)
  const cheapest = trip.fares[0]
  const almostFull = trip.seatsLeft <= 5

  return (
    <article className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline transition-shadow hover:shadow-lift sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-4 xl:gap-5">
        {/* Carrier */}
        <div className="flex items-center gap-3 md:w-44 md:shrink-0 xl:w-52">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-surface text-xs font-extrabold text-brand-fg-strong">
            {trip.airlineCode}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink-900">
              {trip.airline}
            </span>
            <span className="block truncate text-xs text-ink-400">
              {trip.airlineCode}-{trip.flightNumber} &middot; {trip.aircraft}
            </span>
          </span>
        </div>

        {/* Timings */}
        <div className="flex min-w-0 flex-1 items-center gap-3 xl:gap-4">
          <div>
            <p className="text-xl font-extrabold text-ink-900 tabular-nums">
              {trip.departure}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {trip.from.code} &middot; {trip.from.terminal}
            </p>
          </div>

          <div className="flex-1">
            <p className="text-center text-[0.7rem] font-semibold text-ink-400">
              {formatDuration(trip.durationMinutes)}
            </p>
            <div className="relative mt-1 h-px w-full bg-hairline">
              <span className="absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-ink-400" />
              <PlaneIcon className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-surface text-ink-400" />
              <span className="absolute -top-[3px] right-0 h-[7px] w-[7px] rounded-full bg-ink-400" />
            </div>
            <p
              className={cn(
                'mt-1 text-center text-[0.7rem] font-semibold',
                trip.stops.length === 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-ink-500',
              )}
            >
              {describeStops(trip.stops)}
            </p>
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
              {trip.to.code} &middot; {trip.to.terminal}
            </p>
          </div>
        </div>

        {/* Price + CTA */}
        <div className="md:w-36 md:shrink-0 md:text-right xl:w-40">
          <p className="text-[0.7rem] text-ink-400">from</p>
          <p className="text-2xl font-extrabold text-ink-900">
            {formatINR(cheapest.price)}
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs font-semibold',
              almostFull ? 'text-accent-600' : 'text-ink-500',
            )}
          >
            {trip.seatsLeft} seat{trip.seatsLeft === 1 ? '' : 's'} left
          </p>
          <Button
            className="mt-3 w-full md:w-auto"
            onClick={() => setShowFares((open) => !open)}
            aria-expanded={showFares}
          >
            {showFares ? 'Hide fares' : 'View fares'}
          </Button>
        </div>
      </div>

      {/* Layovers + punctuality */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon className="h-3.5 w-3.5" />
          {trip.onTime}% on time
        </span>
        {trip.stops.map((stop) => (
          <span key={stop.code} className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-ink-400" />
            {formatDuration(stop.layoverMinutes)} layover in {stop.city} (
            {stop.code})
          </span>
        ))}
      </div>

      {showFares ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {trip.fares.map((fare) => (
            <FareBrandCard
              key={fare.id}
              fare={fare}
              onSelect={() => onSelectFare(fare)}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}
