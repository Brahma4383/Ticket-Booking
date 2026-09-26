import { useRef } from 'react'

import { cancelBooking } from '@/services/account.services'
import type { BookingMode } from '@/types/account.types'
import type { PendingOrder } from '@/types/common.types'

/**
 * What the payment step needs from a booking flow: a way to make sure a
 * pending booking exists for what is on screen, and a way to let it go.
 */
export interface CheckoutSession {
  /**
   * The pending booking for the current selection — made on the first call,
   * reused on a retry after a declined payment.
   */
  prepare: () => Promise<PendingOrder>
  /** Forget it: it has been paid for, or its hold has run out. */
  discard: () => void
}

interface Held {
  /** What the booking was made from, so a changed selection is noticed. */
  key: string
  order: PendingOrder
}

/**
 * The pending booking a wizard's payment step is paying for.
 *
 * Booking is two calls. The mode's `confirm*` makes the booking as
 * `pending`, holding its seats, berths or rooms; `payForBooking` then pays for
 * it. Between the two sits a traveller who may have a card declined, go back
 * to change a passenger's name, and come forward again — and each of those
 * wants something different from the booking already made:
 *
 * - **Retry after a decline**: pay for the same booking again. Making a new
 *   one would find its own seats taken, by itself.
 * - **Selection changed**: the held booking is for the old selection. It is
 *   cancelled — which puts its inventory back — before the new one is made.
 *
 * The booking lives in a ref on the wizard rather than in the payment step,
 * because the step unmounts on every Back and the booking has to outlive it.
 * `key` is anything that changes when the selection does — the wizards pass
 * the JSON of what they send to `confirm*`.
 */
export function useCheckout(
  mode: BookingMode,
  key: string,
  create: () => Promise<PendingOrder>,
): CheckoutSession {
  const held = useRef<Held | null>(null)

  return {
    prepare: async () => {
      const current = held.current
      if (current && current.key === key && !lapsed(current.order)) {
        return current.order
      }

      held.current = null
      if (current) {
        // Best effort. If it has already been released — expired, or swept —
        // the cancel is refused and there is nothing to do anyway.
        await cancelBooking(mode, current.order.reference).catch(() => undefined)
      }

      const order = await create()
      held.current = { key, order }
      return order
    },
    discard: () => {
      held.current = null
    },
  }
}

function lapsed(order: PendingOrder) {
  return (
    order.holdExpiresAt !== null &&
    new Date(order.holdExpiresAt).getTime() <= Date.now()
  )
}
