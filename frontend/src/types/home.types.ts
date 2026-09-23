import type { IconComponent } from '@/types/common.types'

export interface Offer {
  code: string
  title: string
  description: string
  /** Tailwind gradient stops for the card background. */
  accent: string
  icon: IconComponent
}

export interface Route {
  from: string
  to: string
  mode: string
  duration: string
  price: number
}

export interface Feature {
  title: string
  description: string
  icon: IconComponent
}

/**
 * One card in the support panel.
 *
 * A `Feature` that may also do something: the card about chatting opens the
 * chat rather than describing it. Kept separate from `Feature` because the
 * other lists of features on the site are not clickable and should not grow
 * a flag that says so.
 */
export interface SupportHighlight extends Feature {
  opensChat?: boolean
}

/** One row of the about page's timeline. */
export interface Milestone {
  year: string
  title: string
  description: string
}

export interface Stat {
  value: string
  label: string
}

export interface FooterColumn {
  title: string
  links: string[]
}

export interface SocialLink {
  label: string
  icon: IconComponent
}

export interface NavLink {
  label: string
  href: string
}

/**
 * Where a header menu item goes. A target is a description of the
 * destination rather than a URL: the navbar hands it back to the app, and
 * `hrefFor` in `App.tsx` is the one place that turns it into a path.
 *
 * - `section` scrolls to a section of the home page, routing there first.
 * - `mode` opens the home page with that tab selected in the search panel.
 * - `page` opens a standalone page, optionally at one of its sections.
 * - `account` opens the account page, which asks for a sign-in if needed.
 */
export type NavTarget =
  | { kind: 'section'; id: string }
  | { kind: 'mode'; id: string }
  | {
      kind: 'page'
      page: 'about' | 'legal' | 'careers' | 'newsroom'
      section?: string
    }
  | { kind: 'account' }

export interface NavMenuItem {
  label: string
  /** One line under the label in the dropdown. */
  description?: string
  icon?: IconComponent
  target: NavTarget
}

export interface NavMenu {
  label: string
  items: NavMenuItem[]
}

/** One press release on the newsroom page. */
export interface PressRelease {
  id: string
  /** ISO date, formatted for display by the page. */
  date: string
  category: string
  title: string
  summary: string
}

/** One piece of press coverage, linked out to the publication. */
export interface MediaMention {
  outlet: string
  headline: string
  date: string
}

/** One open role on the careers page. */
export interface JobOpening {
  id: string
  title: string
  team: string
  location: string
  /** Full-time, contract, internship. */
  type: string
  description: string
}

/** One step of the hiring process. */
export interface HiringStep {
  title: string
  description: string
}

/** One block of legal text, and its anchor on the legal page. */
export interface LegalSection {
  id: string
  title: string
  summary: string
  paragraphs: string[]
}
