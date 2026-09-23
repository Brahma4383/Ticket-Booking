import { useEffect } from 'react'

import { Container, Footer, Navbar } from '@/components'
import { BRAND, LEGAL_SECTIONS } from '@/constants'
import { useAuth } from '@/hooks'
import { MailIcon } from '@/icons'
import type { NavTarget } from '@/types/home.types'

/** The last date any section on this page changed. */
const UPDATED = '1 September 2026'

export function Legal({
  section,
  onNavigate,
  onOpenAccount,
}: {
  /** Which clause the visitor asked for, from the Legal menu. */
  section?: string
  onNavigate: (target: NavTarget) => void
  onOpenAccount: () => void
}) {
  const { requestSignIn } = useAuth()

  // The page mounts at the top, so the requested clause is scrolled to after
  // the first paint rather than linked with a hash.
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
        activeMenu="Legal"
      />

      <main className="flex-1">
        <section className="border-b border-hairline bg-surface-muted">
          <Container className="py-12 sm:py-16">
            <p className="text-xs font-bold tracking-[0.14em] text-brand-fg uppercase">
              Legal
            </p>
            <h1 className="mt-3 max-w-2xl text-3xl leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[2.6rem]">
              The terms behind every {BRAND.name} booking
            </h1>
            <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink-500">
              Each section opens with a plain-language summary. The clauses
              under it are the binding text. Last updated {UPDATED}.
            </p>
          </Container>
        </section>

        <Container className="py-12 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-16">
            {/* Sticky index. Plain anchors: unlike the header menus these
                point at sections of the page already on screen. */}
            <nav aria-label="Sections" className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-bold tracking-[0.14em] text-ink-500 uppercase">
                On this page
              </p>
              <ul className="mt-4 space-y-1">
                {LEGAL_SECTIONS.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block rounded-2xl px-3 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-surface-muted hover:text-ink-900"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>

              <a
                href={`mailto:${BRAND.supportEmail}`}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-hairline transition-colors hover:bg-surface-muted"
              >
                <MailIcon className="h-4 w-4" />
                Ask a question
              </a>
            </nav>

            <div className="space-y-10">
              {LEGAL_SECTIONS.map((item) => (
                <section
                  key={item.id}
                  id={item.id}
                  className="scroll-mt-28 rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline sm:p-8"
                >
                  <h2 className="text-2xl tracking-tight">{item.title}</h2>

                  {/* The summary is the part most people read, so it is set
                      apart rather than folded into the first clause. */}
                  <p className="mt-4 rounded-2xl bg-brand-surface px-4 py-3 text-sm leading-relaxed text-brand-fg-strong">
                    {item.summary}
                  </p>

                  <div className="mt-5 space-y-4 text-[0.95rem] leading-relaxed text-ink-600">
                    {item.paragraphs.map((paragraph) => (
                      <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Container>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}
