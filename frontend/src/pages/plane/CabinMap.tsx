import { ExitIcon } from '@/icons'
import type { CabinLayout, CabinSeat } from '@/types/plane.types'
import { cn, formatINR } from '@/utils'

const LEGEND = [
  { label: 'Free', className: 'bg-surface ring-1 ring-hairline' },
  { label: 'Paid', className: 'bg-amber-500/20 ring-1 ring-amber-500' },
  { label: 'Extra legroom', className: 'bg-sky-500/20 ring-1 ring-sky-500' },
  { label: 'Selected', className: 'bg-brand-600' },
  { label: 'Taken', className: 'bg-surface-muted ring-1 ring-hairline' },
]

export function CabinLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {LEGEND.map((entry) => (
        <li
          key={entry.label}
          className="flex items-center gap-2 text-xs text-ink-500"
        >
          <span className={cn('h-4 w-5 rounded', entry.className)} />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}

function SeatButton({
  seat,
  assignedTo,
  selected,
  onToggle,
}: {
  seat: CabinSeat
  /** Initials of the traveller holding this seat, if any. */
  assignedTo: string | null
  selected: boolean
  onToggle: () => void
}) {
  const extraLegroom = seat.zone === 'extra-legroom'
  const paid = seat.price > 0

  const label = seat.occupied
    ? `Seat ${seat.id}, taken`
    : `Seat ${seat.id}, ${seat.price === 0 ? 'free' : formatINR(seat.price)}${
        extraLegroom ? ', extra legroom' : ''
      }${seat.window ? ', window' : seat.aisle ? ', aisle' : ', middle'}`

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={seat.occupied}
      aria-pressed={selected || assignedTo !== null}
      aria-label={label}
      title={
        seat.occupied
          ? 'Taken'
          : `${seat.id} · ${seat.price === 0 ? 'Free' : formatINR(seat.price)}`
      }
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg text-[0.65rem] font-bold transition-all',
        seat.occupied &&
          'cursor-not-allowed bg-surface-muted text-ink-400 ring-1 ring-hairline',
        !seat.occupied &&
          assignedTo !== null &&
          'scale-[1.05] bg-brand-600 text-white ring-2 ring-brand-600',
        !seat.occupied &&
          assignedTo === null &&
          extraLegroom &&
          'cursor-pointer bg-sky-500/15 text-sky-700 ring-1 ring-sky-500 hover:bg-sky-500/25 dark:text-sky-300',
        !seat.occupied &&
          assignedTo === null &&
          !extraLegroom &&
          paid &&
          'cursor-pointer bg-amber-500/15 text-amber-700 ring-1 ring-amber-500 hover:bg-amber-500/25 dark:text-amber-300',
        !seat.occupied &&
          assignedTo === null &&
          !extraLegroom &&
          !paid &&
          'cursor-pointer bg-surface text-ink-600 ring-1 ring-hairline hover:text-brand-fg hover:ring-brand-500',
      )}
    >
      {assignedTo ?? seat.column}
    </button>
  )
}

interface CabinMapProps {
  layout: CabinLayout
  /** Seat id -> initials of the traveller holding it. */
  assignments: Record<string, string>
  onToggleSeat: (seat: CabinSeat) => void
}

export function CabinMap({ layout, assignments, onToggleSeat }: CabinMapProps) {
  return (
    <div className="inline-block min-w-full">
      {/* Column letters */}
      <div
        className="mb-2 grid gap-1.5 px-8"
        style={{
          gridTemplateColumns: layout.columns
            .map((column) => (column === null ? '1.25rem' : '2.25rem'))
            .join(' '),
        }}
      >
        {layout.columns.map((column, index) => (
          <span
            key={column ?? `aisle-${index}`}
            aria-hidden="true"
            className="text-center text-[0.65rem] font-bold text-ink-400"
          >
            {column ?? ''}
          </span>
        ))}
      </div>

      <ul className="space-y-1.5">
        {layout.rows.map((row) => (
          <li key={row.number} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-[0.65rem] font-bold text-ink-400 tabular-nums">
              {row.number}
            </span>

            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: layout.columns
                  .map((column) => (column === null ? '1.25rem' : '2.25rem'))
                  .join(' '),
              }}
            >
              {layout.columns.map((column, index) => {
                if (column === null) {
                  // The aisle: an empty cell that keeps the grid honest.
                  return (
                    <span key={`aisle-${index}`} aria-hidden="true" />
                  )
                }

                const seat = row.seats.find((entry) => entry.column === column)
                if (!seat) return <span key={column} aria-hidden="true" />

                const assignedTo = assignments[seat.id] ?? null
                return (
                  <SeatButton
                    key={seat.id}
                    seat={seat}
                    assignedTo={assignedTo}
                    selected={assignedTo !== null}
                    onToggle={() => onToggleSeat(seat)}
                  />
                )
              })}
            </div>

            {row.exitRow ? (
              <span
                className="ml-1 inline-flex shrink-0 items-center gap-1 text-[0.6rem] font-bold text-sky-600 uppercase dark:text-sky-400"
                title="Emergency exit row"
              >
                <ExitIcon className="h-3.5 w-3.5" />
                Exit
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
