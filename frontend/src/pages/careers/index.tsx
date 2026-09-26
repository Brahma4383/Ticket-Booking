import { useEffect, useMemo, useState } from 'react'

import { Container, Footer, Navbar, SectionHeading } from '@/components'
import {
  BRAND,
  CAREER_PERKS,
  HIRING_STEPS,
  JOB_OPENINGS,
  STATS,
} from '@/constants'
import { useAuth } from '@/hooks'
import { ArrowRightIcon, MailIcon, MapPinIcon } from '@/icons'
import type { NavTarget } from '@/types/home.types'
import { cn } from '@/utils'

const ALL = 'All teams'

/** Where an application goes, with the role reference already filled in. */
function applyHref(id: string, title: string) {
  const subject = encodeURIComponent(`${id} — ${title}`)
  return `mailto:demo@gmail.com?subject=${subject}`
}

export function Careers({
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
  const [team, setTeam] = useState(ALL)

  // Derived from the roles rather than listed separately, so a new opening
  // brings its team filter with it.
  const teams = useMemo(
    () => [ALL, ...new Set(JOB_OPENINGS.map((job) => job.team))],
    [],
  )

  const shown = useMemo(
    () =>
      team === ALL
        ? JOB_OPENINGS
        : JOB_OPENINGS.filter((job) => job.team === team),
    [team],
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
              Careers
            </p>
            <h1 className="mt-3 max-w-2xl text-3xl leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[2.6rem]">
              Build the part of travel nobody enjoys
            </h1>
            <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink-500">
              Booking is the easy half. We are hiring for the rest of it:
              refunds that settle the same day, seat inventory that is actually
              current, and a support desk that can fix a booking rather than
              escalate it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#openings"
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                See {JOB_OPENINGS.length} open roles
                <ArrowRightIcon className="h-4 w-4" />
              </a>
              <a
                href="mailto:demo@gmail.com"
                className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-hairline transition-colors hover:bg-surface-muted"
              >
                <MailIcon className="h-4 w-4" />
                demo@gmail.com
              </a>
            </div>
          </Container>
        </section>

        {/* The same numbers as the about page: what a candidate would be
            joining, stated once and reused. */}
        <section className="pt-10">
          <Container>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-hairline shadow-card ring-1 ring-hairline lg:grid-cols-4">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-surface px-6 py-7 text-center"
                >
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

        <section id="life" className="scroll-mt-24 py-16 sm:py-20">
          <Container>
            <SectionHeading
              eyebrow="Life here"
              title="A team of 240, across three cities"
              description="Small enough that you will know who owns what, large enough that someone is awake when a traveller is stranded."
            />

            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {CAREER_PERKS.map((perk) => {
                const Icon = perk.icon

                return (
                  <li
                    key={perk.title}
                    className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-5 text-lg">{perk.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                      {perk.description}
                    </p>
                  </li>
                )
              })}
            </ul>
          </Container>
        </section>

        <section
          id="openings"
          className="scroll-mt-24 bg-surface-muted py-16 sm:py-20"
        >
          <Container>
            <SectionHeading
              eyebrow="Open roles"
              title="Where we need people right now"
              description="Every role is on-site in the city named, four days a week. Salary bands are shared on the first call."
            />

            {/* Filter chips rather than a select: eight roles across five
                teams is small enough that the whole choice should be visible. */}
            <div
              role="group"
              aria-label="Filter roles by team"
              className="mt-8 flex flex-wrap gap-2"
            >
              {teams.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={team === name}
                  onClick={() => setTeam(name)}
                  className={cn(
                    'cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    team === name
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface text-ink-600 ring-1 ring-hairline hover:bg-surface-muted hover:text-ink-900',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            <ul className="mt-8 space-y-4">
              {shown.map((job) => (
                <li
                  key={job.id}
                  className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg">{job.title}</h3>
                        <span className="rounded-full bg-brand-surface px-2.5 py-1 text-xs font-semibold text-brand-fg-strong">
                          {job.team}
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-ink-500">
                        {job.description}
                      </p>

                      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-ink-500">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPinIcon className="h-4 w-4" />
                          {job.location}
                        </span>
                        <span>{job.type}</span>
                        <span>Ref {job.id}</span>
                      </p>
                    </div>

                    {/* A mailto, not a form: there is no application backend,
                        and a form that silently discards a CV is worse. */}
                    <a
                      href={applyHref(job.id, job.title)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      Apply
                      <ArrowRightIcon className="h-4 w-4" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm text-ink-500">
              Nothing here that fits? Write to{' '}
              <a
                href="mailto:demo@gmail.com"
                className="font-semibold text-brand-fg underline-offset-4 hover:underline"
              >
                demo@gmail.com
              </a>{' '}
              with what you would want to work on. We keep good applications on
              file for a year.
            </p>
          </Container>
        </section>

        <section id="process" className="scroll-mt-24 py-16 sm:py-20">
          <Container>
            <SectionHeading
              eyebrow="Hiring process"
              title="Four steps, about two weeks"
              description="We do not run surprise rounds, and we tell you where you stand after each step."
            />

            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {HIRING_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-lg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-12 rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-10 text-center sm:px-12">
              <h2 className="mx-auto max-w-xl text-2xl tracking-tight text-white sm:text-3xl">
                We hire for judgement, not for a keyword list
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-[0.95rem] leading-relaxed text-white/85">
                If you have shipped something you are proud of and can explain
                the trade-offs you made, apply even when the years on the
                posting do not match yours.
              </p>
              <a
                href="mailto:demo@gmail.com"
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-accent-400"
              >
                <MailIcon className="h-4 w-4" />
                Write to {BRAND.name} careers
              </a>
            </div>
          </Container>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}
