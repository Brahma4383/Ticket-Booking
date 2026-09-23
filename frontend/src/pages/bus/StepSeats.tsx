import { useEffect, useState } from 'react'

import { Button } from '@/components'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { InfoIcon, MapPinIcon } from '@/icons'
import { fetchSeatLayout, formatDuration } from '@/services/bus.services'
import type { BusTrip, Deck, Seat, StopPoint } from '@/types/bus.types'
import { cn } from '@/utils'

import { FareSummary } from './FareSummary'
import { SeatLegend, SeatMap } from './SeatMap'
import { MAX_SEATS } from './useBooking'

const NO_DECKS: Deck[] = []

function StopPicker({
  title,
  points,
  selectedId,
  onSelect,
}: {
  title: string
  points: StopPoint[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="flex items-center gap-2 text-sm font-bold text-ink-900">
        <MapPinIcon className="h-4 w-4 text-ink-400" />
        {title}
      </legend>
      <RadioGroup
        value={selectedId}
        onValueChange={onSelect}
        aria-label={title}
        className="mt-3 gap-2"
      >
        {points.map((point) => {
          const checked = point.id === selectedId
          return (
            <label
              key={point.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition-colors',
                checked
                  ? 'bg-brand-surface ring-brand-border'
                  : 'bg-surface-muted ring-transparent hover:ring-hairline',
              )}
            >
              <RadioGroupItem
                value={point.id}
                className="mt-0.5 cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink-900">
                    {point.name}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink-700 tabular-nums">
                    {point.time}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  {point.landmark}
                </span>
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}

interface StepSeatsProps {
  trip: BusTrip
  /** `YYYY-MM-DD`. A seat sold for one date is still free on the next. */
  date: string
  selectedSeats: Seat[]
  boardingPointId: string
  droppingPointId: string
  onToggleSeat: (seat: Seat) => void
  onBoardingChange: (id: string) => void
  onDroppingChange: (id: string) => void
  onContinue: () => void
}

export function StepSeats({
  trip,
  date,
  selectedSeats,
  boardingPointId,
  droppingPointId,
  onToggleSeat,
  onBoardingChange,
  onDroppingChange,
  onContinue,
}: StepSeatsProps) {
  // Tagging the layout with the trip and date it belongs to lets "loading" be
  // derived during render, instead of flipping a flag from inside the effect.
  const layoutKey = `${trip.id}|${date}`
  const [layout, setLayout] = useState<{ key: string; decks: Deck[] }>({
    key: '',
    decks: [],
  })
  const loading = layout.key !== layoutKey
  const decks = loading ? NO_DECKS : layout.decks

  useEffect(() => {
    let cancelled = false

    fetchSeatLayout(trip, date)
      .then((decks) => {
        if (!cancelled) setLayout({ key: `${trip.id}|${date}`, decks })
      })
      // A seat map that will not load leaves the skeleton up rather than
      // taking the whole step down; the traveller can still go back.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [trip, date])

  const selectedIds = selectedSeats.map((seat) => seat.id)
  const limitReached = selectedSeats.length >= MAX_SEATS

  return (
    <div>
      {/* Trip recap */}
      <div className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl">{trip.operator}</h1>
            <p className="mt-1 text-sm text-ink-500">
              {trip.airConditioned ? 'A/C' : 'Non A/C'}{' '}
              {trip.kind === 'sleeper' ? 'Sleeper' : 'Seater'} ({trip.layout})
              <span className="mx-1.5 text-ink-400">&middot;</span>
              {trip.coach}
            </p>
          </div>
          <p className="text-sm font-semibold text-ink-700 tabular-nums">
            {trip.departure} &rarr; {trip.arrival}
            {trip.arrivesNextDay ? (
              <span className="align-super text-[0.65rem] text-brand-fg">+1</span>
            ) : null}
            <span className="ml-2 font-normal text-ink-400">
              ({formatDuration(trip.durationMinutes)})
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* Seat map */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base">Choose your seats</h2>
              <p className="text-xs text-ink-500">
                Up to {MAX_SEATS} seats per booking
              </p>
            </div>

            <div className="mt-4">
              <SeatLegend />
            </div>

            <div className="mt-6 overflow-x-auto pb-2">
              {loading ? (
                <div
                  className="h-64 animate-pulse rounded-2xl bg-surface-muted"
                  aria-label="Loading seat layout"
                />
              ) : (
                <SeatMap
                  decks={decks}
                  selectedIds={selectedIds}
                  limitReached={limitReached}
                  onToggle={onToggleSeat}
                />
              )}
            </div>

            {limitReached ? (
              <p
                role="status"
                className="mt-4 flex items-start gap-2 rounded-2xl bg-brand-surface px-4 py-3 text-sm text-brand-fg-strong"
              >
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                You have picked the maximum of {MAX_SEATS} seats. Deselect one to
                choose another.
              </p>
            ) : null}
          </section>

          {/* Boarding and dropping */}
          <section className="grid gap-6 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:grid-cols-2 sm:p-6">
            <StopPicker
              title="Boarding point"
              points={trip.boardingPoints}
              selectedId={boardingPointId}
              onSelect={onBoardingChange}
            />
            <StopPicker
              title="Dropping point"
              points={trip.droppingPoints}
              selectedId={droppingPointId}
              onSelect={onDroppingChange}
            />
          </section>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <FareSummary seats={selectedSeats}>
            <Button
              fullWidth
              size="lg"
              disabled={selectedSeats.length === 0}
              onClick={onContinue}
            >
              {selectedSeats.length === 0
                ? 'Select a seat to continue'
                : 'Continue to traveller details'}
            </Button>
          </FareSummary>

          <p className="mt-4 flex items-start gap-2 px-1 text-xs text-ink-500">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {trip.cancellationPolicy}
          </p>
        </div>
      </div>
    </div>
  )
}
