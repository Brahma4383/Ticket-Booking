import type { ReactNode } from 'react'

import { cn } from '@/utils'

/** The single source of truth for page gutters and max width. */
export function Container({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}
