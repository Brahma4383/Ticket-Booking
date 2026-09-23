import type { HTMLAttributes, ReactNode } from 'react'

import { Container } from '@/components/Container'
import { cn } from '@/utils'

interface SectionProps extends HTMLAttributes<HTMLElement> {
  id?: string
  /**
   * `canvas` sits on the page background; `surface` is a raised band with
   * a hairline above and below; `muted` is a recessed band. Alternating
   * them is what keeps a long page from reading as one flat scroll.
   */
  tone?: 'canvas' | 'surface' | 'muted'
  /** Tightens the vertical rhythm for a section that follows a hero. */
  spacing?: 'default' | 'compact' | 'none'
  /** Passed to the inner `Container`. */
  containerClassName?: string
  children: ReactNode
}

const TONE: Record<NonNullable<SectionProps['tone']>, string> = {
  canvas: '',
  surface: 'bg-surface border-y border-hairline',
  muted: 'bg-surface-muted/60',
}

const SPACING: Record<NonNullable<SectionProps['spacing']>, string> = {
  default: 'py-16 sm:py-20 lg:py-24',
  compact: 'py-10 sm:py-12 lg:py-16',
  none: '',
}

/**
 * A page section with the site's vertical rhythm and gutters built in.
 *
 * Every marketing section — home, about, careers, newsroom, legal — sits
 * inside one of these so the spacing between sections is the same number
 * everywhere, and `scroll-mt` clears the sticky header when a nav link
 * jumps to it.
 */
export function Section({
  id,
  tone = 'canvas',
  spacing = 'default',
  className,
  containerClassName,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-24', TONE[tone], SPACING[spacing], className)}
      {...rest}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  )
}
