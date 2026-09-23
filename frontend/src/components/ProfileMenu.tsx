import { useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'
import { ChevronDownIcon, ExitIcon, TicketIcon, UserIcon } from '@/icons'
import { cn } from '@/utils'

/** `Brahmanand Suryawanshi` -> `BS`; a single name gives a single letter. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'

  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** The first word, which is what fits next to the avatar. */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

const ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 ' +
  'text-left text-sm font-semibold transition-colors'

/**
 * Who is signed in, and the two things they can do about it.
 *
 * Replaces the Log in / Sign up pair in the navbar once there is a session.
 * It is a menu rather than two more buttons because the header is already
 * full at this width, and because "my bookings" and "log out" are both about
 * the account rather than about the page.
 *
 * On shadcn's `DropdownMenu`, which supplies the arrow keys, typeahead,
 * Escape, click-outside and focus return that the previous version wired up
 * by hand.
 */
export function ProfileMenu({
  onOpenAccount,
}: {
  onOpenAccount: () => void
}) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  // The provider renders this only when signed in; the guard is for types.
  if (!user) return null

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          'inline-flex cursor-pointer items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 outline-none',
          'text-sm font-semibold text-ink-700 ring-1 ring-hairline transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand-500',
          open ? 'bg-surface-muted' : 'bg-surface hover:bg-surface-muted',
        )}
      >
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white"
        >
          {initials(user.fullName)}
        </span>
        <span className="hidden max-w-[10ch] truncate xl:inline">
          {firstName(user.fullName)}
        </span>
        <ChevronDownIcon
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-2xl bg-surface p-2 shadow-lift ring-1 ring-hairline"
      >
        <DropdownMenuLabel className="flex items-center gap-2.5 px-3 py-2 font-normal">
          <UserIcon className="h-4 w-4 shrink-0 text-ink-400" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink-900">
              {user.fullName}
            </span>
            <span className="block truncate text-xs text-ink-500">
              {user.email}
            </span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1 bg-hairline" />

        <DropdownMenuItem
          onSelect={onOpenAccount}
          className={cn(ITEM, 'text-ink-700 focus:bg-surface-muted focus:text-ink-900')}
        >
          <TicketIcon className="h-4 w-4 shrink-0 text-ink-400" />
          My bookings
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={signOut}
          className={cn(ITEM, 'text-danger-fg focus:bg-danger-surface focus:text-danger-fg')}
        >
          <ExitIcon className="h-4 w-4 shrink-0" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
