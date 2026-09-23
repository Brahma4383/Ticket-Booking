import { Button } from '@/components'
import {
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CoffeeIcon,
  HotelIcon,
  InfoIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  StarIcon,
  UsersIcon,
} from '@/icons'
import type {
  Property,
  RatePlan,
  RoomType,
} from '@/types/hotel.types'
import { cn, formatINR } from '@/utils'

import { HotelFareSummary } from './HotelFareSummary'
import { MAX_ROOMS } from './useHotelBooking'

function PlanRow({
  plan,
  nights,
  rooms,
  selected,
  onSelect,
}: {
  plan: RatePlan
  nights: number
  rooms: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-4 ring-1 transition-colors sm:flex-row sm:items-center',
        selected
          ? 'bg-brand-surface ring-brand-border'
          : 'bg-surface-muted ring-transparent',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{plan.name}</p>
        <ul className="mt-1.5 space-y-1">
          <li className="flex items-start gap-1.5 text-xs">
            {plan.breakfastIncluded ? (
              <CoffeeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CloseIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
            )}
            <span
              className={
                plan.breakfastIncluded ? 'text-ink-600' : 'text-ink-400'
              }
            >
              {plan.breakfastIncluded ? 'Breakfast included' : 'No breakfast'}
            </span>
          </li>
          <li className="flex items-start gap-1.5 text-xs">
            {plan.freeCancellation ? (
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CloseIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
            )}
            <span
              className={plan.freeCancellation ? 'text-ink-600' : 'text-ink-400'}
            >
              {plan.cancellationNote}
            </span>
          </li>
          {plan.payAtHotel ? (
            <li className="flex items-start gap-1.5 text-xs">
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="text-ink-600">Pay at the property</span>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-lg font-extrabold text-ink-900">
          {formatINR(plan.pricePerNight)}
        </p>
        <p className="text-[0.7rem] text-ink-400">per night</p>
        <p className="mt-0.5 text-[0.7rem] text-ink-500">
          {formatINR(plan.pricePerNight * nights * rooms)} total
        </p>
        <Button
          variant={selected ? 'primary' : 'secondary'}
          className="mt-2 w-full sm:w-auto"
          onClick={onSelect}
        >
          {selected ? 'Selected' : 'Select'}
        </Button>
      </div>
    </div>
  )
}

interface StepRoomsProps {
  property: Property
  nights: number
  rooms: number
  selectedPlanId: string | null
  selectedRoomId: string | null
  guests: number
  onSelectPlan: (room: RoomType, plan: RatePlan) => void
  onRoomsChange: (rooms: number) => void
  onContinue: () => void
  summaryPlan: RatePlan | null
}

export function StepRooms({
  property,
  nights,
  rooms,
  selectedPlanId,
  selectedRoomId,
  guests,
  onSelectPlan,
  onRoomsChange,
  onContinue,
  summaryPlan,
}: StepRoomsProps) {
  return (
    <div>
      {/* Property recap */}
      <div className="overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-hairline">
        <div
          className={cn(
            'grid h-28 place-items-center bg-gradient-to-br',
            property.imageAccent,
          )}
          aria-hidden="true"
        >
          <HotelIcon className="h-10 w-10 text-white/70" />
        </div>
        <div className="p-5">
          <h1 className="flex flex-wrap items-center gap-2 text-xl">
            <span className="min-w-0">{property.name}</span>
            {property.starRating > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                aria-label={`${property.starRating} star`}
              >
                {Array.from({ length: property.starRating }, (_, index) => (
                  <StarIcon key={index} className="h-4 w-4 text-accent-500" />
                ))}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
            <MapPinIcon className="h-4 w-4 shrink-0" />
            {property.locality}, {property.city}
            <span className="text-ink-400">&middot;</span>
            <ClockIcon className="h-4 w-4 shrink-0" />
            Check-in {property.checkInTime} &middot; check-out{' '}
            {property.checkOutTime}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {/* Rooms */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base">Choose a room</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-500">
                  Rooms
                </span>
                <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1">
                  <button
                    type="button"
                    onClick={() => onRoomsChange(rooms - 1)}
                    disabled={rooms <= 1}
                    aria-label="Fewer rooms"
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-600 transition-colors hover:bg-surface hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="w-5 text-center text-sm font-bold text-ink-900 tabular-nums">
                    {rooms}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRoomsChange(rooms + 1)}
                    disabled={rooms >= MAX_ROOMS}
                    aria-label="More rooms"
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-600 transition-colors hover:bg-surface hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-6">
              {property.rooms.map((room) => {
                const tooSmall = room.maxGuests * rooms < guests

                return (
                  <div key={room.id} className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm">{room.name}</h3>
                      <p className="text-xs font-semibold text-accent-600">
                        {room.roomsLeft} left
                      </p>
                    </div>

                    <ul className="mt-2 flex flex-wrap items-center gap-2">
                      <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
                        <UsersIcon className="h-3.5 w-3.5" />
                        Up to {room.maxGuests}
                      </li>
                      <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
                        {room.bed} bed
                      </li>
                      <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500">
                        {room.sizeSqft} sq ft
                      </li>
                      {room.amenities.slice(0, 2).map((amenity) => (
                        <li
                          key={amenity}
                          className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[0.7rem] font-semibold text-ink-500"
                        >
                          {amenity}
                        </li>
                      ))}
                    </ul>

                    {tooSmall ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-accent-600">
                        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Holds {room.maxGuests * rooms} of your {guests} guests.
                        Add another room or pick a larger one.
                      </p>
                    ) : null}

                    <div className="mt-3 space-y-2.5">
                      {room.ratePlans.map((plan) => (
                        <PlanRow
                          key={plan.id}
                          plan={plan}
                          nights={nights}
                          rooms={rooms}
                          selected={
                            selectedRoomId === room.id &&
                            selectedPlanId === plan.id
                          }
                          onSelect={() => onSelectPlan(room, plan)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Amenities */}
          <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6">
            <h2 className="text-base">What this place offers</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {property.amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="flex items-center gap-2 text-sm text-ink-600"
                >
                  <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {amenity}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <HotelFareSummary
            ratePlan={summaryPlan}
            nights={nights}
            rooms={rooms}
          >
            <Button
              fullWidth
              size="lg"
              disabled={!summaryPlan}
              onClick={onContinue}
            >
              {summaryPlan ? 'Continue to guest details' : 'Select a room'}
            </Button>
          </HotelFareSummary>
        </div>
      </div>
    </div>
  )
}
