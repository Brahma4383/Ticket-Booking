import type { ReactNode } from 'react'

import { Button } from '@/components/Button'
import { useAuth } from '@/hooks'
import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND } from '@/constants'
import { ArrowLeftIcon, CheckIcon, ShieldIcon, UserIcon } from '@/icons'
import type { BookingStepMeta } from '@/types/common.types'
import { cn } from '@/utils'

function Stepper({
  steps,
  currentIndex,
}: {
  steps: BookingStepMeta[]
  currentIndex: number
}) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex

        return (
          <li key={step.id} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-xs font-semibold transition-colors',
                active ? 'bg-brand-surface text-brand-fg-strong' : 'text-ink-400',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-[0.7rem]',
                  active && 'bg-brand-600 text-white',
                  done && 'bg-brand-surface text-brand-fg',
                  !active && !done && 'bg-surface-muted text-ink-400',
                )}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'h-px w-4',
                  index < currentIndex ? 'bg-brand-border' : 'bg-hairline',
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

interface BookingLayoutProps {
  steps: BookingStepMeta[]
  activeId: string
  /** Omitted on the first and last steps, where there is nowhere to go back to. */
  onBack?: () => void
  backLabel?: string
  /** Leaves the flow entirely — the logo and "modify search" both use it. */
  onExit: () => void
  children: ReactNode
}

/**
 * Chrome shared by every booking wizard: a reduced header with the progress
 * indicator, the step body, and a support footer. During checkout the
 * marketing nav is noise, so it is deliberately not rendered here.
 */
export function BookingLayout({
  steps,
  activeId,
  onBack,
  backLabel = 'Back',
  onExit,
  children,
}: BookingLayoutProps) {
  const { user, signedIn, requestSignIn, signOut } = useAuth()

  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeId),
  )
  const current = steps[currentIndex]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-surface/95 shadow-card backdrop-blur-md print:hidden">
        <Container>
          <div className="flex h-18 items-center justify-between gap-4">
            <Logo onNavigate={onExit} />

            <nav aria-label="Booking progress" className="hidden xl:block">
              <Stepper steps={steps} currentIndex={currentIndex} />
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {/* Wrapped rather than given `hidden` directly: Button already
                  sets `inline-flex`, which wins over `hidden` in the cascade. */}
              <span className="hidden items-center gap-2 sm:inline-flex">
                {signedIn ? (
                  <>
                    <span
                      className="max-w-[14ch] truncate text-sm font-semibold text-ink-700"
                      title={user?.email}
                    >
                      {user?.fullName}
                    </span>
                    <Button variant="secondary" onClick={signOut}>
                      Log out
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => requestSignIn('login')}
                  >
                    <UserIcon className="h-4 w-4" />
                    Log in
                  </Button>
                )}
              </span>
            </div>
          </div>

          {/* Compact progress for everything below xl. */}
          <div className="border-t border-hairline py-2.5 xl:hidden">
            <p className="text-xs font-semibold text-ink-500">
              Step {currentIndex + 1} of {steps.length}
              <span className="mx-1.5 text-ink-400">&middot;</span>
              <span className="text-ink-900">{current?.label}</span>
            </p>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted"
              role="progressbar"
              aria-valuenow={currentIndex + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-label="Booking progress"
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                style={{
                  width: `${((currentIndex + 1) / steps.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </Container>
      </header>

      <main className="flex-1 pb-16">
        <Container className="pt-6">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-4 -ml-2 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-2 text-sm font-semibold text-ink-500 transition-colors hover:bg-surface hover:text-ink-900 print:hidden"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              {backLabel}
            </button>
          ) : null}
          {children}
        </Container>
      </main>

      <footer className="border-t border-hairline bg-surface py-6">
        <Container>
          <div className="flex flex-col gap-2 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <ShieldIcon className="h-4 w-4" />
              Test-mode checkout &mdash; payments go through a sandbox gateway
              and no real money moves.
            </p>
            <p>
              Need help? Call{' '}
              <a
                href={`tel:${BRAND.supportPhone.replace(/\s/g, '')}`}
                className="font-semibold text-ink-700 hover:underline"
              >
                {BRAND.supportPhone}
              </a>
            </p>
          </div>
        </Container>
      </footer>
    </div>
  )
}
