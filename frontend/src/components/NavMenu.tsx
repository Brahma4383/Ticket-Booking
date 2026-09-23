import { useId } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDownIcon } from '@/icons'
import type { NavMenu as NavMenuData, NavTarget } from '@/types/home.types'
import { cn } from '@/utils'

/**
 * One header tab and its dropdown, on shadcn's `DropdownMenu`.
 *
 * Opens on click rather than on hover: a hover menu is unusable on a touch
 * screen, and the same button then works for keyboard users unchanged. Hover
 * only previews the panel once a sibling menu is already open, which is the
 * behaviour people expect from a menu bar — and is why the menu is
 * `modal={false}`: a modal dropdown swallows pointer events outside itself,
 * and the sibling would never see the pointer arrive.
 */
export function NavMenu({
  menu,
  open,
  onOpen,
  onClose,
  onSelect,
  active = false,
}: {
  menu: NavMenuData
  open: boolean
  /** Asks the bar to make this the open menu; only one may be open. */
  onOpen: () => void
  onClose: () => void
  onSelect: (target: NavTarget) => void
  /** True when the page on screen came from this menu. */
  active?: boolean
}) {
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => (next ? onOpen() : onClose())}
      modal={false}
    >
      <div
        onMouseEnter={() => {
          // Only follows the pointer across the bar once something is open.
          if (!open && document.querySelector('[data-navmenu-open="true"]')) {
            onOpen()
          }
        }}
      >
        <DropdownMenuTrigger
          data-navmenu-open={open}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 outline-none',
            'text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-500',
            open || active
              ? 'bg-surface-muted text-ink-900'
              : 'text-ink-600 hover:bg-surface-muted hover:text-ink-900',
          )}
        >
          {menu.label}
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </DropdownMenuTrigger>
      </div>

      <DropdownMenuContent
        align="start"
        sideOffset={8}
        aria-label={menu.label}
        className="w-80 rounded-3xl bg-surface p-2 shadow-lift ring-1 ring-hairline"
      >
        {menu.items.map((item) => {
          const Icon = item.icon

          return (
            <DropdownMenuItem
              key={item.label}
              onSelect={() => onSelect(item.target)}
              className="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 text-left focus:bg-surface-muted focus:text-ink-900"
            >
              {Icon ? (
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-surface text-brand-fg">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              ) : null}
              <span>
                <span className="block text-sm font-semibold text-ink-900">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The same menu as a collapsible block, for the mobile sheet. A dropdown
 * floating over a sheet that is itself a dropdown reads badly, so on small
 * screens the items push the rest of the list down instead.
 */
export function NavMenuAccordion({
  menu,
  open,
  onToggle,
  onSelect,
}: {
  menu: NavMenuData
  open: boolean
  onToggle: () => void
  onSelect: (target: NavTarget) => void
}) {
  const panelId = useId()

  return (
    <div className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-ink-800 transition-colors hover:bg-surface-muted"
      >
        {menu.label}
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 text-ink-500 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="pb-2">
          {menu.items.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onSelect(item.target)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors hover:bg-surface-muted"
              >
                {Icon ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-surface text-brand-fg">
                    <Icon className="h-4 w-4" />
                  </span>
                ) : null}
                <span className="text-sm font-medium text-ink-700">
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
