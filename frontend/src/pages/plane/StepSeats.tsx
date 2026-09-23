import { useEffect, useState } from 'react'

import { Button } from '@/components'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckIcon, InfoIcon, LuggageIcon, UtensilsIcon } from '@/icons'
import { ADD_ONS, fetchCabinLayout } from '@/services/plane.services'
import type { IconComponent } from '@/types/common.types'
import type {
  AddOnId,
  CabinLayout,
  CabinSeat,
  FareBrand,
  FlightTraveller,
  FlightTrip,
} from '@/types/plane.types'
import { cn, formatINR } from '@/utils'

import { CabinLegend, CabinMap } from './CabinMap'
import { takesSeat } from './usePlaneBooking'

const ADD_ON_ICON: Record<AddOnId, IconComponent> = {
  meal: UtensilsIcon,
  baggage: LuggageIcon,
  priority: CheckIcon,
}

/** Two letters that fit inside a seat, e.g. "BS" for Brahmanand Suryawanshi. */
function initialsOf(traveller: FlightTraveller, index: number) {
  const first = traveller.firstName.trim()[0]
  const last = traveller.lastName.trim()[0]
  if (first && last) return `${first}${last}`.toUpperCase()
  if (first) return first.toUpperCase()
  return String(index + 1)
}

interface StepSeatsProps {
  trip: FlightTrip
  /** `YYYY-MM-DD`. A seat sold for one date is free again on the next. */
  date: string
  fareBrand: FareBrand
  travellers: FlightTraveller[]
  seatByTraveller: Record<string, CabinSeat>
  addOns: AddOnId[]
  travellerCount: number
  onAssignSeat: (travellerId: string, seat: CabinSeat) => void
  onClearSeat: (travellerId: string) => void
  onToggleAddOn: (addOn: AddOnId) => void
  onContinue: () => void
  summary: React.ReactNode
}

export function StepSeats({
  trip,
  date,
  fareBrand,
  travellers,
  seatByTraveller,
  addOns,
  travellerCount,
  onAssignSeat,
  onClearSeat,
  onToggleAddOn,
  onContinue,
  summary,
}: StepSeatsProps) {
  // Only travellers who get a seat can be selected for one.
  const seated = travellers.filter(takesSeat)
  const [activeId, setActiveId] = useState(seated[0]?.id ?? '')

  // Tagging the layout with the flight and date it belongs to lets "loading"
  // be derived during render, instead of flipping a flag from inside the
  // effect.
  const layoutKey = `${trip.id}|${date}`
  const [layoutState, setLayoutState] = useState<{
    key: string
    layout: CabinLayout | null
  }>({ key: '', layout: null })
  const loading = layoutState.key !== layoutKey
  const layout = loading ? null : layoutState.layout

  useEffect(() => {
    let cancelled = false

    fetchCabinLayout(trip, date)
      .then((layout) => {
        if (!cancelled) setLayoutState({ key: `${trip.id}|${date}`, layout })
      })
      // A cabin map that will not load leaves the skeleton up rather than
      // taking the whole step down; the traveller can still go back.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [trip, date])

  // Seat id -> initials, for painting the map.
  const assignments: Record<string, string> = {}
  seated.forEach((traveller, index) => {
    const seat = seatByTraveller[traveller.id]
    if (seat) assignments[seat.id] = initialsOf(traveller, index)
  })

  const handleToggleSeat = (seat: CabinSeat) => {
    const holder = seated.find(
      (traveller) => seatByTraveller[traveller.id]?.id === seat.id,
    )
    // Clicking an already-taken seat gives it up rather than stealing it.
    if (holder) {
      onClearSeat(holder.id)
      setActiveId(holder.id)
      return
    }

    if (!activeId) return
    onAssignSeat(activeId, seat)

    // Move on to the next traveller still without a seat.
    const next = seated.find(
      (traveller) => traveller.id !== activeId && !seatByTraveller[traveller.id],
    )
    if (next) setActiveId(next.id)
  }

  const chosenCount = Object.keys(seatByTraveller).length

  return (
    <div>
      <div className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl">
              {trip.airline}
              <span className="ml-2 text-sm font-semibold text-ink-400">
                {trip.airlineCode}-{trip.flightNumber}
              </span>
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {trip.aircraft}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              {fareBrand.name} fare
            </p>
          </div>
          <p className="text-sm font-semibold text-ink-700 tabular-nums">
            {trip.from.code} {trip.departure} &rarr; {trip.to.code}{' '}
            {trip.arrival}
            {trip.daysToArrive > 0 ? (
              <span className="align-super text-[0.65rem] text-brand-fg">
                +{trip.daysToArrive}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* Seats */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base">Choose seats</h2>
              <p className="text-xs text-ink-500">
                Optional &mdash; skip and the airline assigns them at check-in
              </p>
            </div>

            {/* Who is being seated */}
            <ul className="mt-4 flex flex-wrap gap-2">
              {seated.map((traveller, index) => {
                const seat = seatByTraveller[traveller.id]
                const active = traveller.id === activeId
                const name =
                  traveller.firstName.trim() || `Traveller ${index + 1}`

                return (
                  <li key={traveller.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(traveller.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition-colors',
                        active
                          ? 'bg-brand-surface text-brand-fg-strong ring-brand-border'
                          : 'bg-surface-muted text-ink-500 ring-transparent hover:text-ink-900',
                      )}
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[0.6rem] text-white">
                        {initialsOf(traveller, index)}
                      </span>
                      <span className="max-w-[9rem] truncate">{name}</span>
                      <span
                        className={cn(
                          'tabular-nums',
                          seat ? 'text-ink-900' : 'text-ink-400',
                        )}
                      >
                        {seat ? seat.id : '—'}
                      </span>
                      {seat ? (
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label={`Clear seat for ${name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onClearSeat(traveller.id)
                          }}
                          className="text-ink-400 hover:text-ink-900"
                        >
                          &times;
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4">
              <CabinLegend />
            </div>

            {!fareBrand.freeSeat ? (
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-brand-surface px-4 py-3 text-xs text-brand-fg-strong">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                Seats are chargeable on the {fareBrand.name} fare. Upgrade to
                Comfort or Flexi for free selection.
              </p>
            ) : null}

            <div className="mt-6 overflow-x-auto pb-2">
              {loading || !layout ? (
                <div
                  className="h-80 animate-pulse rounded-2xl bg-surface-muted"
                  aria-label="Loading seat map"
                />
              ) : (
                <div className="mx-auto w-fit rounded-2xl bg-surface-muted p-4 ring-1 ring-hairline">
                  <CabinMap
                    layout={layout}
                    assignments={assignments}
                    onToggleSeat={handleToggleSeat}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Add-ons */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">Add-ons</h2>
            <p className="mt-1 text-sm text-ink-500">
              Charged per traveller ({travellerCount}).
            </p>

            <div className="mt-4 space-y-2.5">
              {ADD_ONS.map((addOn) => {
                const Icon = ADD_ON_ICON[addOn.id]
                const checked = addOns.includes(addOn.id)
                const included = addOn.id === 'meal' && fareBrand.mealIncluded

                return (
                  <label
                    key={addOn.id}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl p-4 ring-1 transition-colors',
                      included
                        ? 'cursor-not-allowed bg-surface-muted opacity-60 ring-transparent'
                        : checked
                          ? 'cursor-pointer bg-brand-surface ring-brand-border'
                          : 'cursor-pointer bg-surface-muted ring-transparent hover:ring-hairline',
                    )}
                  >
                    <Checkbox
                      checked={checked && !included}
                      disabled={included}
                      onCheckedChange={() => onToggleAddOn(addOn.id)}
                      className="mt-0.5 cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
                    />
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-900">
                        {addOn.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {included
                          ? `Already included in the ${fareBrand.name} fare.`
                          : addOn.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-ink-900 tabular-nums">
                      {included ? 'Free' : formatINR(addOn.price)}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          {summary}
          <Button fullWidth size="lg" className="mt-4" onClick={onContinue}>
            {chosenCount === 0
              ? 'Skip seats and continue'
              : 'Continue to payment'}
          </Button>
          {chosenCount > 0 && chosenCount < seated.length ? (
            <p className="mt-3 text-center text-xs text-ink-500">
              {seated.length - chosenCount} traveller
              {seated.length - chosenCount === 1 ? '' : 's'} without a seat will
              be assigned one at check-in.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
