import { useEffect, useRef, useState } from 'react'

interface RevealOptions {
  /** Reveal once and stay revealed (default), or hide again when scrolled out. */
  once?: boolean
  /** Pulls the trigger line up from the bottom edge, so content starts
      moving just before it would be fully in view. */
  rootMargin?: string
  threshold?: number
}

/**
 * Marks an element as revealed once it scrolls into view.
 *
 * Pair with the `reveal` / `reveal-group` utilities in `index.css`: the
 * element starts hidden and the `data-revealed` attribute this returns
 * lets it transition in. Anything already scrolled *past* on mount — a
 * page restored mid-scroll — is revealed immediately rather than left
 * invisible above the fold. Under `prefers-reduced-motion` everything is
 * revealed at once and nothing animates.
 */
export function useReveal<T extends HTMLElement = HTMLElement>({
  once = true,
  rootMargin = '0px 0px -8% 0px',
  threshold = 0.12,
}: RevealOptions = {}) {
  const ref = useRef<T | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setRevealed(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const passed = entry.boundingClientRect.bottom < 0
          if (entry.isIntersecting || passed) {
            setRevealed(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setRevealed(false)
          }
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return { ref, revealed }
}
