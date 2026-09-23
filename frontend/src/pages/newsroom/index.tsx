import { useEffect, useMemo, useState } from 'react'

import { Container, Footer, Navbar, SectionHeading } from '@/components'
import { BRAND, MEDIA_MENTIONS, PRESS_RELEASES } from '@/constants'
import { useAuth } from '@/hooks'
import { ArrowRightIcon, MailIcon, PhoneIcon } from '@/icons'
import type { NavTarget } from '@/types/home.types'
import { cn, formatDateWithYear } from '@/utils'

const ALL = 'All updates'

/** Where press enquiries go. Separate from the traveller support address. */
const PRESS_EMAIL = 'press@suryabooker.in'

export function Newsroom({
  section,
  onNavigate,
  onOpenAccount,
}: {
  /** Which part of the page the Company menu asked for. */
  section?: string
  onNavigate: (target: NavTarget) => void
  onOpenAccount: () => void
}) {
  const { requestSignIn } = useAuth()
  const [category, setCategory] = useState(ALL)

  const categories = useMemo(
    () => [ALL, ...new Set(PRESS_RELEASES.map((item) => item.category))],
    [],
  )

  // The newest release is the lead story, so the filtered list below always
  // starts from the second item.
  const [lead, ...rest] = PRESS_RELEASES

  const shown = useMemo(
    () =>
      category === ALL
        ? rest
        : rest.filter((item) => item.category === category),
    [category, rest],
  )

  useEffect(() => {
    if (!section) return

    const frame = requestAnimationFrame(() => {
      document
        .getElementById(section)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    return () => cancelAnimationFrame(frame)
  }, [section])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAuth={requestSignIn}
        onOpenAccount={onOpenAccount}
        onNavigate={onNavigate}
        activeMenu="Company"
      />

      <main className="flex-1">
        <section className="border-b border-hairline bg-surface-muted">
          <Container className="py-12 sm:py-16">
            <p className="text-xs font-bold tracking-[0.14em] text-brand-fg uppercase">
              Newsroom
            </p>
            <h1 className="mt-3 max-w-2xl text-3xl leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[2.6rem]">
              What we have announced, in our own words
            </h1>
            <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink-500">
              Product launches, company news and partnership announcements.
              Journalists on deadline can reach the press desk directly, any
              hour.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`mailto:${PRESS_EMAIL}`}
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <MailIcon className="h-4 w-4" />
                {PRESS_EMAIL}
              </a>
              <a
                href="#coverage"
                className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-hairline transition-colors hover:bg-surface-muted"
              >
                In the press
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </div>
          </Container>
        </section>

        {/* Lead story. One release gets the full-width treatment so the page
            opens on news rather than on a list. */}
        <section className="pt-12 sm:pt-16">
          <Container>
            <article className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-10 sm:px-10 sm:py-12">
              <p className="flex flex-wrap items-center gap-3 text-xs font-semibold text-white/80">
                <span className="rounded-full bg-white/15 px-3 py-1">
                  Latest
                </span>
                <time dateTime={lead.date}>{formatDateWithYear(lead.date)}</time>
                <span>{lead.category}</span>
              </p>
              <h2 className="mt-4 max-w-3xl text-2xl leading-tight tracking-tight text-white sm:text-[2rem]">
                {lead.title}
              </h2>
              <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-white/85">
                {lead.summary}
              </p>
              <a
                href={`mailto:${PRESS_EMAIL}?subject=${encodeURIComponent(lead.title)}`}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-accent-400"
              >
                Request the full release
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </article>
          </Container>
        </section>

        <section id="releases" className="scroll-mt-24 py-16 sm:py-20">
          <Container>
            <SectionHeading
              eyebrow="Press releases"
              title="Everything else we have published"
              description="Announcements are kept here in full for three years. Older material is available from the press desk on request."
            />

            <div
              role="group"
              aria-label="Filter releases by category"
              className="mt-8 flex flex-wrap gap-2"
            >
              {categories.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(name)}
                  className={cn(
                    'cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    category === name
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface text-ink-600 ring-1 ring-hairline hover:bg-surface-muted hover:text-ink-900',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="mt-8 rounded-3xl bg-surface p-6 text-sm text-ink-500 shadow-card ring-1 ring-hairline">
                Nothing else under {category} yet. The lead story above is the
                most recent one.
              </p>
            ) : (
              <ul className="mt-8 space-y-4">
                {shown.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-500">
                          <time dateTime={item.date}>
                            {formatDateWithYear(item.date)}
                          </time>
                          <span className="rounded-full bg-brand-surface px-2.5 py-1 text-brand-fg-strong">
                            {item.category}
                          </span>
                        </p>
                        <h3 className="mt-3 text-lg">{item.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-ink-500">
                          {item.summary}
                        </p>
                      </div>

                      {/* No article pages behind these yet, so the action is
                          an enquiry rather than a dead link. */}
                      <a
                        href={`mailto:${PRESS_EMAIL}?subject=${encodeURIComponent(item.title)}`}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-surface-muted px-5 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-hairline transition-colors hover:bg-surface hover:ring-brand-border"
                      >
                        Request release
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Container>
        </section>

        <section
          id="coverage"
          className="scroll-mt-24 bg-surface-muted py-16 sm:py-20"
        >
          <Container>
            <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
              <div>
                <SectionHeading
                  eyebrow="In the press"
                  title="Where others have written about us"
                  description="A selection of recent coverage. We do not pay for placement, and we correct the record where a piece gets a number wrong."
                />

                <ul className="mt-8 divide-y divide-hairline overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-hairline">
                  {MEDIA_MENTIONS.map((mention) => (
                    <li
                      key={mention.headline}
                      className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold tracking-[0.12em] text-brand-fg uppercase">
                          {mention.outlet}
                        </p>
                        <p className="mt-1.5 text-[0.95rem] font-semibold text-ink-900">
                          {mention.headline}
                        </p>
                      </div>
                      <time
                        dateTime={mention.date}
                        className="shrink-0 text-xs font-semibold text-ink-500"
                      >
                        {formatDateWithYear(mention.date)}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Press desk card. Everything a journalist needs is in one
                  block rather than spread across the page. */}
              <aside className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline lg:sticky lg:top-24 lg:self-start">
                <h3 className="text-lg">Press desk</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  For interviews, data requests or comment on a story, write to
                  the desk. We answer within four hours on working days, and
                  the same day on deadline.
                </p>

                <div className="mt-5 space-y-2.5 text-sm">
                  <a
                    href={`mailto:${PRESS_EMAIL}`}
                    className="flex items-center gap-2.5 font-semibold text-ink-700 transition-colors hover:text-ink-900"
                  >
                    <MailIcon className="h-4 w-4 text-brand-fg" />
                    {PRESS_EMAIL}
                  </a>
                  <a
                    href={`tel:${BRAND.supportPhone.replace(/\s/g, '')}`}
                    className="flex items-center gap-2.5 font-semibold text-ink-700 transition-colors hover:text-ink-900"
                  >
                    <PhoneIcon className="h-4 w-4 text-brand-fg" />
                    {BRAND.supportPhone}
                  </a>
                </div>

                <dl className="mt-6 space-y-3 border-t border-hairline pt-5 text-sm">
                  <div>
                    <dt className="font-semibold text-ink-900">Company name</dt>
                    <dd className="text-ink-500">
                      {BRAND.name} Travel Pvt. Ltd.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-900">Founded</dt>
                    <dd className="text-ink-500">2018, Mumbai</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-900">Offices</dt>
                    <dd className="text-ink-500">
                      Mumbai, Bengaluru and Indore
                    </dd>
                  </div>
                </dl>

                <p className="mt-5 text-xs leading-relaxed text-ink-500">
                  Logos and brand assets are available on request. Please do
                  not recolour or alter the wordmark.
                </p>
              </aside>
            </div>
          </Container>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}
