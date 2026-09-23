import { useCallback, useEffect, useState } from 'react'

import type { ResolvedTheme, ThemePreference } from '@/types/common.types'
import {
  DARK_QUERY,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from '@/utils/theme'

/**
 * Light/dark with the OS as the starting point.
 *
 * Until the visitor picks a side, `preference` stays `null` and the page keeps
 * tracking the system setting live. Toggling pins an explicit choice, which is
 * remembered across visits.
 *
 * The class is applied by an inline script in index.html before first paint;
 * this hook keeps it in sync afterwards.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredTheme)
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredTheme()),
  )

  // Follow the OS for as long as no explicit choice has been made.
  useEffect(() => {
    if (preference !== null) return

    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) =>
      setTheme(event.matches ? 'dark' : 'light')

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: ResolvedTheme = current === 'dark' ? 'light' : 'dark'
      setPreference(next)
      writeStoredTheme(next)
      return next
    })
  }, [])

  return { theme, toggle }
}
