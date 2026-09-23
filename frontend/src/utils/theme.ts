import type { ResolvedTheme, ThemePreference } from '@/types/common.types'

export const THEME_STORAGE_KEY = 'suryabooker-theme'

export const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Reads the saved choice. Storage can throw in private mode or when cookies
 * are blocked, so a failure just means "no preference, follow the OS".
 */
export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function writeStoredTheme(preference: ThemePreference) {
  try {
    if (preference === null) localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Not being able to remember the choice is not worth failing over.
  }
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Single place that decides what the document should look like. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference ?? getSystemTheme()
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
