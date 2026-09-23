import type { ReactNode } from 'react'

import { cn } from '@/utils'

/** Eyebrow + title + description block used at the top of every section. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  action?: ReactNode
}) {
  const centered = align === 'center'

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        centered && 'sm:flex-col sm:items-center',
      )}
    >
      <div className={cn('max-w-2xl', centered && 'text-center')}>
        {eyebrow ? (
          <p className="text-xs font-bold tracking-[0.14em] text-brand-fg uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 text-3xl tracking-tight sm:text-[2.1rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-500">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
