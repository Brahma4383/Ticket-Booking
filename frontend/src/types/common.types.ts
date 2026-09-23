import type { ComponentType, SVGProps } from 'react'

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

export type PaymentMethodId = 'upi' | 'card' | 'netbanking' | 'wallet'
