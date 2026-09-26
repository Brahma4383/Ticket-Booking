import type { ComponentType, SVGProps } from 'react'

import type { BookingStatus } from '@/types/account.types'

/* ------------------------------------------------------------------
   Primitives
   ------------------------------------------------------------------ */

/** Any icon from `@/icons`, passed around as data. */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export type Gender = 'male' | 'female' | 'other'

/* ------------------------------------------------------------------
   Theme
   ------------------------------------------------------------------ */

/** What actually gets applied to the document. */
export type ResolvedTheme = 'light' | 'dark'

/** What the visitor chose. `null` means "follow the operating system". */
export type ThemePreference = ResolvedTheme | null

/* ------------------------------------------------------------------
   Home search panel

   The panel is entirely data driven: adding a mode, or a field to a mode,
   in `@/constants` is all it takes for the UI to pick it up.
   ------------------------------------------------------------------ */

/** The kinds of input the search panel knows how to render. */
export type SearchFieldType = 'place' | 'date' | 'time' | 'select'

export interface SearchField {
  /** Unique within its travel mode; doubles as the form state key. */
  name: string
  label: string
  type: SearchFieldType
  placeholder?: string
  /** Only for `type: 'select'`. */
  options?: string[]
  /** Column span on the desktop 12-column search grid. */
  span?: 2 | 3 | 4 | 6
  icon?: IconComponent
}

/** One tab of the search panel: bus, train, plane, hotel or cab. */
export interface TravelMode {
  id: string
  label: string
  icon: IconComponent
  /** Sub-line shown under the search panel heading. */
  tagline: string
  /** Label for the submit button, e.g. "Search buses". */
  cta: string
  fields: SearchField[]
  /** The two field names the swap button exchanges, if the mode has one. */
  swap?: [string, string]
}

/* ------------------------------------------------------------------
   Booking wizards

   Shared by every flow under `@/pages/<mode>`; anything specific to one
   mode lives in that mode's own `*.types.ts`.
   ------------------------------------------------------------------ */

/** One entry in a wizard's progress indicator. */
export interface BookingStepMeta {
  id: string
  label: string
}

/** A single row in a fare breakdown. */
export interface FareLine {
  label: string
  value: number
  /** Rendered smaller and dimmer — used for per-item detail rows. */
  detail?: string
}

/* ------------------------------------------------------------------
   Payment

   Booking is two steps. A mode's `confirm*` call makes the booking as
   `pending`, holding its seats, berths or rooms; `payForBooking` in
   `payment.services` then takes the money for that reference. Everything
   below is shared by the payment step and by every mode's confirmation.
   ------------------------------------------------------------------ */

export type PaymentMethodId = 'upi' | 'card' | 'netbanking' | 'wallet'

/** Mirrors `payment.status`. Only `success` is money that arrived. */
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded'

/** One attempt to pay, as the API describes it on a ticket and a receipt. */
export interface PaymentRecord {
  /** `TXN…` — what a traveller quotes to support. */
  transactionRef: string
  method: PaymentMethodId
  /** `UPI`, `Card`, `Netbanking`, `Wallet`. */
  methodLabel: string
  /** The UPI ID, a masked card (`Visa •••• 4242`), the bank or the wallet. */
  instrument: string
  amount: number
  currency: string
  status: PaymentStatus
  /** ISO 8601 when the payment went through; null for a failed attempt. */
  paidAt: string | null
}

/**
 * What the payment form sends. Only the chosen method's field is read; the
 * server drops the rest, so a form that keeps state for every method can
 * send it all.
 */
export interface PaymentRequest {
  method: PaymentMethodId
  upiId?: string
  card?: { number: string; name: string; expiry: string; cvv: string }
  bank?: string
  wallet?: string
}

/** A booking that exists and is waiting to be paid for. */
export interface PendingOrder {
  /** The PNR or booking id the mode's `confirm*` call returned. */
  reference: string
  /** ISO 8601. When the hold on its inventory runs out unpaid. */
  holdExpiresAt: string | null
}

/**
 * The three fields every mode's confirmation carries on top of its own,
 * because they are the payment module's to fill in.
 */
export interface BookingPaymentState {
  status: BookingStatus
  /** The payment that went through, else the latest attempt, else null. */
  payment: PaymentRecord | null
  /** Set while `status` is `pending`: when the hold runs out. */
  holdExpiresAt: string | null
}
