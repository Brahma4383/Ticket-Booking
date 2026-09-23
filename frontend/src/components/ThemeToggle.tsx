import { useTheme } from '@/hooks'
import { MoonIcon, SunIcon } from '@/icons'
import { cn } from '@/utils'

/**
 * Flips between light and dark. Before the first click the page follows the
 * operating system, so the icon shown is whatever is currently in effect.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full',
        'bg-surface text-ink-600 ring-1 ring-hairline transition-colors',
        'hover:bg-surface-muted hover:text-ink-900',
        className,
      )}
    >
      {isDark ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
    </button>
  )
}
