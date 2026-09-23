import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Container,
  Footer,
  Modal,
  Navbar,
  SectionHeading,
} from '@/components'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks'
import {
  BusIcon,
  CabIcon,
  CheckIcon,
  ChevronRightIcon,
  HotelIcon,
  InfoIcon,
  PlaneIcon,
  SpinnerIcon,
  TicketIcon,
  TrainIcon,
} from '@/icons'
import { cancelBooking, fetchMyBookings } from '@/services/account.services'
import { ApiError } from '@/services/api'
import type {
  BookingMode,
  BookingStatus,
  BookingSummary,
} from '@/types/account.types'
import type { NavTarget } from '@/types/home.types'
import { cn, formatINR, formatLongDate, toInputDate } from '@/utils'

import { Ticket } from './Ticket'

const MODES: Record<
  BookingMode,
  { label: string; icon: typeof BusIcon }
> = {
  bus: { label: 'Bus', icon: BusIcon },
  train: { label: 'Train', icon: TrainIcon },
  plane: { label: 'Flight', icon: PlaneIcon },
  hotel: { label: 'Stay', icon: HotelIcon },
  cab: { label: 'Cab', icon: CabIcon },
}

/** Confirmed is the only one you can travel on; the rest are informational. */
const STATUS: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: {
    label: 'Confirmed',
    className: 'bg-success-surface text-success-fg',
  },
  completed: {
    label: 'Completed',
    className: 'bg-brand-surface text-brand-fg-strong',
  },
  pending: { label: 'Pending', className: 'bg-surface-muted text-ink-600' },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-danger-surface text-danger-fg',
  },
  failed: { label: 'Failed', className: 'bg-danger-surface text-danger-fg' },
}

/**
 * `formatLongDate` wants a bare `YYYY-MM-DD`; a cab's pickup arrives as a full
 * timestamp, so the date half is all that reaches it.
 */
function when(booking: BookingSummary) {
  const start = formatLongDate(booking.travelDate.slice(0, 10))
  if (!booking.endDate) return start
  return `${start} — ${formatLongDate(booking.endDate.slice(0, 10))}`
}

/**
 * Which of the three tabs a booking belongs in, from its dates alone.
 *
 * A stay covers a range, so it counts as today's for every night of it. The
 * status is deliberately not consulted: a cancelled trip still happened on a
 * date, and the card already carries its own status badge - hiding it from
 * its date's tab would just make it unfindable.
 */
type Phase = 'today' | 'upcoming' | 'completed'

function phaseOf(booking: BookingSummary, today: string): Phase {
  const start = booking.travelDate.slice(0, 10)
  const end = booking.endDate?.slice(0, 10) ?? start

  if (end < today) return 'completed'
  if (start > today) return 'upcoming'
  return 'today'
}

const TABS: Array<{ id: Phase; label: string; empty: string }> = [
  {
    id: 'today',
    label: 'Today',
    empty: 'Nothing departing today. Anything booked for later is under Upcoming.',
  },
  {
    id: 'upcoming',
    label: 'Upcoming',
    empty: 'No trips booked ahead yet. Search a journey to add one.',
  },
  {
    id: 'completed',
    label: 'Completed',
    empty: 'No past journeys yet. Trips move here the day after they end.',
  },
]

function BookingCard({
  booking,
  onOpen,
  onCancel,
}: {
  booking: BookingSummary
  onOpen: () => void
  /** Omitted when this booking can no longer be cancelled. */
  onCancel?: () => void
}) {
  const mode = MODES[booking.mode]
  const status = STATUS[booking.status]
  const Icon = mode.icon

  return (
    <li>
      {/* Stacks on a phone and turns into a row from `sm` up.
          Everything that used to sit in a fixed right-hand column - the fare
          and the "View ticket" cue - drops below the details on a narrow
          screen, where there is no room for a second column. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer flex-col gap-4 rounded-3xl bg-surface p-5 text-left ring-1 ring-hairline transition-shadow hover:shadow-card hover:ring-brand-border sm:flex-row sm:items-center"
      >
        <span className="flex min-w-0 flex-1 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
            <Icon className="h-6 w-6" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* Wraps rather than truncates: a station-to-station title is
                  longer than a phone is wide, and half a destination is no
                  use to anyone. */}
              <span className="text-base font-bold break-words text-ink-900">
                {booking.title}
              </span>
              <Badge
                className={cn(
                  'h-auto shrink-0 rounded-full border-0 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide uppercase',
                  status.className,
                )}
              >
                {status.label}
              </Badge>
            </span>

            <span className="mt-1 block text-sm break-words text-ink-500">
              {mode.label} &middot; {booking.detail}
            </span>

            {/* The date and the reference are separate lines on a phone: the
                dot between them left the reference orphaned mid-wrap. */}
            <span className="mt-1 block text-sm text-ink-600">
              {when(booking)}
            </span>
            <span className="mt-0.5 block font-mono text-xs font-bold tracking-wide text-ink-500">
              {booking.reference}
            </span>
          </span>
        </span>

        <span className="flex items-center justify-between gap-3 border-t border-hairline pt-3 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1 sm:border-0 sm:pt-0">
          <span className="text-lg font-extrabold text-ink-900">
            {formatINR(booking.amount)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-brand-fg">
            View ticket
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </span>
        </span>
      </button>

      {/* Outside the card's own button: a button inside a button is invalid,
          and the two actions are genuinely different - one opens the ticket,
          the other ends it. */}
      {onCancel ? (
        <span className="mt-2 flex justify-end px-1">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold text-ink-500 transition-colors hover:bg-danger-surface hover:text-danger-fg"
          >
            Cancel booking
          </button>
        </span>
      ) : null}
    </li>
  )
}

/**
 * The account page: every ticket this traveller holds.
 *
 * Two views in one, like the rest of this app: the list, and whichever ticket
 * was opened from it. The ticket itself is fetched only on that click — the
 * list carries a summary, not five embedded itineraries.
 */
export function Account({
  onExit,
  onNavigate,
}: {
  onExit: () => void
  /** Handles every header and footer link; this page has none of its own. */
  onNavigate: (target: NavTarget) => void
}) {
  const { user, signedIn, restoring, requestSignIn } = useAuth()

  const [bookings, setBookings] = useState<BookingSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<BookingSummary | null>(null)
  const [tab, setTab] = useState<Phase | null>(null)

  /** The booking the cancel dialog is asking about, if it is open. */
  const [cancelling, setCancelling] = useState<BookingSummary | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  /** Shown above the list after a cancellation, with the refund. */
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * The list split three ways.
   *
   * Upcoming runs soonest first - the next trip is the one being looked for -
   * while completed keeps the newest-first order the API already returns.
   */
  const groups = useMemo(() => {
    const today = toInputDate()
    const split: Record<Phase, BookingSummary[]> = {
      today: [],
      upcoming: [],
      completed: [],
    }

    for (const booking of bookings ?? []) {
      split[phaseOf(booking, today)].push(booking)
    }

    split.upcoming.sort((a, b) => a.travelDate.localeCompare(b.travelDate))
    split.today.sort((a, b) => a.travelDate.localeCompare(b.travelDate))

    return split
  }, [bookings])

  /**
   * Opens on the tab with something in it: today's trips first, then the next
   * one booked. Once the traveller picks a tab, that choice sticks.
   */
  const activeTab: Phase =
    tab ??
    (groups.today.length > 0
      ? 'today'
      : groups.upcoming.length > 0
        ? 'upcoming'
        : 'completed')

  useEffect(() => {
    // Nothing to ask for until the stored token has been turned into a
    // session, and nothing to ask for at all if there is not one.
    if (restoring || !signedIn) return

    const controller = new AbortController()

    fetchMyBookings(controller.signal)
      // The error is cleared here rather than before the request, so the
      // effect body holds no synchronous setState.
      .then((rows) => {
        setBookings(rows)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Your bookings could not be loaded.',
        )
      })

    return () => controller.abort()
  }, [restoring, signedIn])

  /**
   * A booking can be cancelled while it is live and the journey has not
   * finished. The server decides for real - this only keeps the button off
   * rows it would certainly refuse.
   */
  const isCancellable = (booking: BookingSummary) =>
    (booking.status === 'confirmed' || booking.status === 'pending') &&
    phaseOf(booking, toInputDate()) !== 'completed'

  const confirmCancel = () => {
    if (cancelling === null) return

    setCancelBusy(true)
    setCancelError(null)

    cancelBooking(cancelling.mode, cancelling.reference)
      .then((result) => {
        // The row is replaced rather than the list refetched: the server
        // returns the cancelled booking in the same shape the list holds.
        setBookings((rows) =>
          (rows ?? []).map((row) =>
            row.mode === result.booking.mode &&
            row.reference === result.booking.reference
              ? result.booking
              : row,
          ),
        )
        setNotice(
          `Booking ${result.booking.reference} is cancelled. ` +
            `${formatINR(Number(result.refundAmount))} will be refunded to ` +
            'the way you paid, within five working days.',
        )
        setCancelling(null)
      })
      .catch((cause: unknown) => {
        setCancelError(
          cause instanceof ApiError
            ? cause.message
            : 'That booking could not be cancelled. Please try again.',
        )
      })
      .finally(() => setCancelBusy(false))
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAuth={requestSignIn}
        onOpenAccount={() => setOpen(null)}
        onNavigate={onNavigate}
        activeMenu="Booking"
      />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          {open ? (
            <Ticket
              mode={open.mode}
              reference={open.reference}
              onBack={() => setOpen(null)}
              onGoHome={onExit}
            />
          ) : (
            <>
              <SectionHeading
                eyebrow="My account"
                title={
                  user ? `Your trips, ${user.fullName.split(' ')[0]}` : 'Your trips'
                }
                description="Every ticket you have booked, split by when you travel. Open one for the full ticket."
              />

              <div className="mt-8">
                {restoring ? (
                  <p className="flex items-center gap-2 text-sm text-ink-500">
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                    Checking your session…
                  </p>
                ) : !signedIn ? (
                  <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-hairline">
                    <TicketIcon className="mx-auto h-10 w-10 text-ink-400" />
                    <h3 className="mt-4 text-lg">Log in to see your tickets</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
                      Your bookings are tied to your account, so we need to know
                      who you are before we can show them.
                    </p>
                    <Button
                      size="lg"
                      className="mt-6"
                      onClick={() => requestSignIn('login')}
                    >
                      Log in
                    </Button>
                  </div>
                ) : error !== null ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
                  >
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : bookings === null ? (
                  <p className="flex items-center gap-2 text-sm text-ink-500">
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                    Loading your bookings…
                  </p>
                ) : bookings.length === 0 ? (
                  <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-hairline">
                    <TicketIcon className="mx-auto h-10 w-10 text-ink-400" />
                    <h3 className="mt-4 text-lg">No bookings yet</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
                      Buses, trains, flights, hotels and cabs you book will all
                      show up here.
                    </p>
                    <Button size="lg" className="mt-6" onClick={onExit}>
                      Start a search
                    </Button>
                  </div>
                ) : (
                  <>
                    {notice ? (
                      <div
                        role="status"
                        className="mb-6 flex items-start gap-2 rounded-2xl bg-success-surface px-4 py-3 text-sm text-success-fg"
                      >
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{notice}</span>
                      </div>
                    ) : null}

                    <Tabs
                      value={activeTab}
                      onValueChange={(next) => setTab(next as Phase)}
                      className="gap-0"
                    >
                      <TabsList
                        aria-label="Filter bookings by when you travel"
                        className="no-scrollbar -mx-1 flex h-auto w-auto justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 px-1 pb-1"
                      >
                        {TABS.map((item) => {
                          const count = groups[item.id].length

                          return (
                            <TabsTrigger
                              key={item.id}
                              value={item.id}
                              className={cn(
                                'group/tab h-auto flex-none shrink-0 cursor-pointer gap-1.5 rounded-full border-0 px-3 py-2.5 sm:gap-2 sm:px-4',
                                'text-sm font-semibold text-ink-600 transition-colors after:hidden',
                                'hover:bg-surface-muted hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                                'data-active:bg-brand-600 data-active:text-white data-active:shadow-none data-active:hover:bg-brand-600 dark:data-active:border-0 dark:data-active:bg-brand-600 dark:data-active:text-white',
                              )}
                            >
                              {item.label}
                              {/* The count is the useful half of the label: it
                                  says whether the tab is worth opening. */}
                              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-bold text-ink-600 group-data-active/tab:bg-white/20 group-data-active/tab:text-white">
                                {count}
                              </span>
                            </TabsTrigger>
                          )
                        })}
                      </TabsList>
                    </Tabs>

                    {groups[activeTab].length === 0 ? (
                      <p className="mt-6 rounded-3xl bg-surface p-6 text-sm text-ink-500 ring-1 ring-hairline">
                        {TABS.find((item) => item.id === activeTab)?.empty}
                      </p>
                    ) : (
                      <ul className="mt-6 grid gap-4">
                        {groups[activeTab].map((booking) => (
                          <BookingCard
                            key={`${booking.mode}-${booking.reference}`}
                            booking={booking}
                            onOpen={() => setOpen(booking)}
                            onCancel={
                              isCancellable(booking)
                                ? () => {
                                    setCancelError(null)
                                    setCancelling(booking)
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </Container>
      </main>

      <Modal
        open={cancelling !== null}
        onClose={() => {
          if (!cancelBusy) setCancelling(null)
        }}
        title="Cancel this booking?"
        subtitle={
          cancelling
            ? `${cancelling.title} · ${cancelling.reference}`
            : undefined
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          The seats, berths or rooms held by this booking go back on sale
          straight away, so this cannot be undone. You would have to book
          again, at whatever fare is available then.
        </p>

        {cancelling ? (
          <dl className="mt-5 space-y-2 rounded-2xl bg-surface-muted p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-500">Paid</dt>
              <dd className="font-semibold text-ink-900">
                {formatINR(cancelling.amount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-500">Refund</dt>
              <dd className="font-extrabold text-ink-900">
                {formatINR(cancelling.amount)}
              </dd>
            </div>
            <p className="pt-1 text-xs leading-relaxed text-ink-500">
              Refunds return to the way you paid, within five working days.
            </p>
          </dl>
        ) : null}

        {cancelError !== null ? (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
          >
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{cancelError}</span>
          </div>
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={cancelBusy}
            onClick={() => setCancelling(null)}
          >
            Keep booking
          </Button>
          <Button fullWidth disabled={cancelBusy} onClick={confirmCancel}>
            {cancelBusy ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              'Cancel booking'
            )}
          </Button>
        </div>
      </Modal>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}
