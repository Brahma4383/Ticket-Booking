import { SteeringIcon } from '@/icons'
import type { Deck, Seat } from '@/types/bus.types'
import { cn, formatINR } from '@/utils'

const LEGEND = [
  { label: 'Available', className: 'bg-surface ring-1 ring-hairline' },
  { label: 'Selected', className: 'bg-brand-600' },
  { label: 'Ladies only', className: 'bg-pink-500/20 ring-1 ring-pink-500' },
  { label: 'Booked', className: 'bg-surface-muted ring-1 ring-hairline' },
]

export function SeatLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {LEGEND.map((entry) => (
        <li
          key={entry.label}
          className="flex items-center gap-2 text-xs text-ink-500"
        >
          <span className={cn('h-4 w-6 rounded', entry.className)} />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}

function SeatButton({
  seat,
  selected,
  disabled,
  onToggle,
}: {
  seat: Seat
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const booked = seat.status === 'booked'
  const ladies = seat.status === 'ladies'
  const isSleeper = seat.kind === 'sleeper'

  const label = booked
    ? `Seat ${seat.id}, already booked`
    : `Seat ${seat.id}, ${formatINR(seat.price)}${ladies ? ', ladies only' : ''}${
        selected ? ', selected' : ''
      }`

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={booked || disabled}
      aria-pressed={selected}
      aria-label={label}
      title={booked ? 'Already booked' : `${seat.id} · ${formatINR(seat.price)}`}
      className={cn(
        'flex items-center justify-center rounded-lg text-[0.7rem] font-bold transition-all',
        isSleeper ? 'h-9 w-16' : 'h-10 w-10',
        booked &&
          'cursor-not-allowed bg-surface-muted text-ink-400 ring-1 ring-hairline',
        !booked &&
          selected &&
          'scale-[1.04] bg-brand-600 text-white ring-2 ring-brand-600',
        !booked &&
          !selected &&
          ladies &&
          'cursor-pointer bg-pink-500/15 text-pink-600 ring-1 ring-pink-500 hover:bg-pink-500/25 dark:text-pink-300',
        !booked &&
          !selected &&
          !ladies &&
          'cursor-pointer bg-surface text-ink-600 ring-1 ring-hairline hover:ring-brand-500 hover:text-brand-fg',
        disabled && !selected && !booked && 'cursor-not-allowed opacity-45',
      )}
    >
      {seat.id}
    </button>
  )
}

interface SeatMapProps {
  decks: Deck[]
  selectedIds: string[]
  /** True once the per-booking seat cap is reached. */
  limitReached: boolean
  onToggle: (seat: Seat) => void
}

export function SeatMap({
  decks,
  selectedIds,
  limitReached,
  onToggle,
}: SeatMapProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
      {decks.map((deck) => (
        <div
          key={deck.name}
          className="rounded-2xl bg-surface-muted p-4 ring-1 ring-hairline"
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="text-sm capitalize">{deck.name} deck</h3>
            {deck.name === 'lower' ? (
              <SteeringIcon
                className="h-5 w-5 text-ink-400"
                aria-label="Driver"
              />
            ) : null}
          </div>

          <div
            className="grid justify-center gap-2"
            style={{
              gridTemplateColumns: `repeat(${deck.columns}, min-content)`,
            }}
          >
            {Array.from({ length: deck.rows }, (_, rowIndex) =>
              Array.from({ length: deck.columns }, (_, columnIndex) => {
                const row = rowIndex + 1
                const column = columnIndex + 1

                if (deck.aisles.includes(column)) {
                  // The aisle: an empty cell that keeps the grid honest.
                  return (
                    <span
                      key={`aisle-${row}-${column}`}
                      aria-hidden="true"
                      className="w-5"
                    />
                  )
                }

                const seat = deck.seats.find(
                  (entry) => entry.row === row && entry.column === column,
                )
                if (!seat) {
                  return <span key={`gap-${row}-${column}`} aria-hidden="true" />
                }

                const selected = selectedIds.includes(seat.id)
                return (
                  <SeatButton
                    key={seat.id}
                    seat={seat}
                    selected={selected}
                    disabled={limitReached && !selected}
                    onToggle={() => onToggle(seat)}
                  />
                )
              }),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
