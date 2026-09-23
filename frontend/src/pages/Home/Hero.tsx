import { Container } from '@/components'
import { BRAND, STATS } from '@/constants'
import { StarIcon } from '@/icons'
import heroBg from '@/assets/hero-bg.jpg'

import type { SearchSubmission } from './SearchPanel'
import { SearchPanel } from './SearchPanel'

export function Hero({
  onSearch,
  modeRequest,
}: {
  onSearch: (modeId: string, submission: SearchSubmission) => boolean
  /** Passed straight through to the search panel. */
  modeRequest?: { id: string; seq: string } | null
}) {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* The photo band wraps the headline *and* the search panel, so its
          bottom edge falls below the card instead of cutting across it. The
          stats below sit on the plain page background. */}
      <div className="relative">
        <div aria-hidden="true" className="absolute inset-0 bg-hero-base">
          <img
            src={heroBg}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-center"
          />
          {/* One warm scrim, weighted to the top where the type sits, and
              defined per theme in `index.css`. Light enough that the city and
              the river still read, dark enough that white text clears 4.5:1
              over the sky. */}
          <div className="hero-scrim absolute inset-0" />
          {/* Fade into the page background so the seam is invisible in both
              themes: cream on the light one, near-black on the dark. */}
          <div className="hero-fade absolute inset-x-0 bottom-0 h-40" />
        </div>

        <Container className="relative pt-14 pb-28">
          <div className="mx-auto max-w-2xl text-center">
            {/* Stays on the light surface token in both themes: it is a chip
                on a photo, not on the page, so it should not flip dark. */}
            <span className="inline-flex items-center gap-2 rounded-full bg-hero-chip px-4 py-1.5 text-xs font-semibold text-hero-chip-fg shadow-card ring-1 ring-white/40 backdrop-blur-sm">
              <StarIcon className="h-4 w-4 text-accent-600" />
              Rated 4.6 by 1.2 lakh travellers
            </span>

            <h1 className="mt-5 text-4xl leading-[1.1] font-extrabold tracking-tight text-hero-fg [text-shadow:0_2px_18px_rgba(0,0,0,0.45)] sm:text-[3.25rem]">
              {BRAND.tagline}
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-hero-fg-soft [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] sm:text-lg">
              Compare buses, trains, flights, hotels and cabs side by side,
              then book in a few taps — with instant refunds if plans change.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-5xl">
            <SearchPanel onSearch={onSearch} modeRequest={modeRequest} />
          </div>
        </Container>
      </div>

      <Container className="relative pb-16">
        <dl className="mx-auto mt-4 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-2xl font-extrabold text-ink-900 sm:text-3xl">
                  {stat.value}
                </span>
                <span className="mt-1 block text-sm text-ink-500">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}
