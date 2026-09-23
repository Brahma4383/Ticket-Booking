import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import { useReveal } from '@/hooks/useReveal'
import { cn } from '@/utils'

type RevealTag =
  | 'div'
  | 'section'
  | 'article'
  | 'header'
  | 'footer'
  | 'ul'
  | 'ol'
  | 'li'
  | 'span'
  | 'p'
  | 'dl'
  | 'figure'

interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** The element rendered. A plain `div` unless the markup wants otherwise. */
  as?: RevealTag
  /** Milliseconds before this element starts moving once it is in view. */
  delay?: number
  /**
   * Stagger the direct children instead of animating the wrapper: each
   * child rises 70ms after the one before it. Use on a grid or list.
   */
  group?: boolean
  /** Reveal every time it scrolls into view rather than only the first. */
  repeat?: boolean
  children: ReactNode
}

/**
 * Fades and rises its content into place when it scrolls into view.
 *
 * Wraps `useReveal` and the `reveal` / `reveal-group` utilities so a page
 * can animate a section with one element and no per-page CSS:
 *
 *   <Reveal>…a section heading…</Reveal>
 *   <Reveal as="ul" group className="grid …">…cards…</Reveal>
 */
export function Reveal({
  as = 'div',
  delay = 0,
  group = false,
  repeat = false,
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const { ref, revealed } = useReveal<HTMLElement>({ once: !repeat })
  const Tag = as

  return (
    <Tag
      // React 19 passes `ref` as a prop; the hook's ref is typed loosely
      // enough to sit on any of the tags above.
      ref={ref as never}
      data-revealed={revealed ? '' : undefined}
      className={cn(group ? 'reveal-group' : 'reveal', className)}
      style={
        {
          ...(delay ? { '--reveal-delay': `${delay}ms` } : null),
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </Tag>
  )
}
