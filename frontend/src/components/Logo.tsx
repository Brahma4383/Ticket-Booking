import { useId } from 'react'

import { BRAND } from '@/constants'
import { cn } from '@/utils'

/**
 * The ticket mark: a stub with a tear-off counterfoil, a gold sun — `surya` —
 * rising inside it, and a wing sweeping away under it.
 *
 * Drawn rather than dropped in as an image. It stays sharp at any size, costs
 * no request, and takes its colour from the brand tokens - so one mark sits on
 * the white navbar and the dark footer without a second file or a `tone` of
 * its own.
 *
 * The stub runs brand-600 to brand-800 rather than the brighter orange it
 * would otherwise be, and that is forced by the gold. The artwork this follows
 * gets its snap from navy against gold, a 4.6:1 pair; gold on a mid orange is
 * 1.9:1 and the sun simply disappears. Deepening the stub buys the sun 3.8:1
 * where it actually sits. Deeper still would be safer on paper but turns the
 * stub to brown and throws away the brand colour, so this is the floor.
 *
 * The plane, the globe and the QR code from the full-size artwork are
 * deliberately not here. This renders at 36px, where they collapse into noise;
 * a mark that only works large is not a mark. What survives the size is the
 * silhouette, the sun, and one sweep under it.
 */
function Mark() {
  // Navbar and footer both render a Logo on the same page, and a gradient
  // needs an id that is unique per document.
  const gradient = useId()

  return (
    <svg
      viewBox="0 0 40 32"
      className="h-9 w-auto shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-600)" />
          <stop offset="100%" stopColor="var(--color-brand-800)" />
        </linearGradient>
      </defs>

      {/* The stub. The two arcs at x=14 are the notches it tears along. */}
      <path
        fill={`url(#${gradient})`}
        d="M6 3h5.5a2.5 2.5 0 0 0 5 0H34a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H16.5a2.5 2.5 0 0 0-5 0H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"
      />

      {/* Perforation, running between the two notches. */}
      <path
        d="M14 7v18"
        stroke="#fff"
        strokeOpacity="0.75"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeDasharray="2 2.6"
      />

      {/* The sun, in the accent gold rather than white. The rays are
          load-bearing: a plain disc over a curve draws a head and a pair of
          shoulders, and at 36px the mark read as an avatar until they went
          in. */}
      <circle cx="25.5" cy="13" r="3.5" fill="var(--color-accent-400)" />
      <path
        d="M25.5 8.1V6.4M28.5 9.1l1.1-1.3M22.5 9.1l-1.1-1.3M30.3 11.8l1.6-.4M20.7 11.8l-1.6-.4"
        stroke="var(--color-accent-400)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* The wing sweeping out from under the sun: a filled crescent, thick at
          the root and tapering to a tip, rather than a stroke of even weight -
          an even stroke under a disc reads as a smile. It lifts to the right,
          which is also what stops it reading as a pair of shoulders. */}
      <path
        fill="#fff"
        d="M19.6 25.2Q26.2 19.5 33.6 20Q26.6 23.4 20.2 27.3Z"
      />
    </svg>
  )
}

interface LogoProps {
  tone?: 'dark' | 'light'
  className?: string
  /**
   * When given, the logo becomes a button that runs this instead of jumping to
   * the top anchor — used to leave the booking flow.
   */
  onNavigate?: () => void
}

/** Wordmark plus mark. `tone="light"` is for use on dark backgrounds. */
export function Logo({ tone = 'dark', className, onNavigate }: LogoProps) {
  const label = `${BRAND.name} home`
  const inner = (
    <>
      <Mark />
      <span
        className={cn(
          'text-[1.35rem] leading-none font-extrabold tracking-tight',
          tone === 'light' ? 'text-white' : 'text-ink-900',
        )}
      >
        {BRAND.name}
      </span>
    </>
  )
  const shared = cn('inline-flex items-center gap-2.5', className)

  if (onNavigate) {
    return (
      <button
        type="button"
        onClick={onNavigate}
        className={cn(shared, 'cursor-pointer')}
        aria-label={label}
      >
        {inner}
      </button>
    )
  }

  return (
    <a href="#top" className={shared} aria-label={label}>
      {inner}
    </a>
  )
}
