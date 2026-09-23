import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import type { IconComponent } from '@/types/common.types'
import { cn } from '@/utils'

import { FIELD_CONTROL, Shell } from './Field'

/**
 * One suggestion. `value` is what lands in the input; `meta` is the muted
 * trailing note (a station code, a state) and is matched on as well, so
 * typing "BCT" finds Mumbai Central.
 */
export interface AutocompleteOption {
  value: string
  meta?: string
}

/** The list is capped so 700-odd stations do not become 700 DOM nodes. */
const MAX_VISIBLE = 60

function normalise(text: string) {
  return text.trim().toLowerCase()
}

/**
 * Ranks matches so the ones a person means come first: an exact code, then
 * names starting with what they typed, then anything containing it.
 */
function rank(option: AutocompleteOption, query: string) {
  const value = option.value.toLowerCase()
  const meta = option.meta?.toLowerCase() ?? ''

  if (meta === query) return 0
  if (value.startsWith(query)) return 1
  if (meta.startsWith(query)) return 2
  if (value.includes(query)) return 3
  return -1
}

function filterOptions(options: AutocompleteOption[], rawQuery: string) {
  const query = normalise(rawQuery)
  if (!query) return options.slice(0, MAX_VISIBLE)

  const scored: { option: AutocompleteOption; score: number }[] = []
  for (const option of options) {
    const score = rank(option, query)
    if (score >= 0) scored.push({ option, score })
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_VISIBLE)
    .map((entry) => entry.option)
}

/**
 * Splits `text` around the first case-insensitive occurrence of `query` so the
 * matched run can be emphasised without dangerous HTML.
 */
function highlight(text: string, rawQuery: string) {
  const query = normalise(rawQuery)
  if (!query) return <>{text}</>

  const at = text.toLowerCase().indexOf(query)
  if (at < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold text-brand-fg">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  )
}

interface AutocompleteFieldProps {
  label: string
  options: AutocompleteOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  icon?: IconComponent
  wrapperClassName?: string
  /** Shown above the list when nothing matches. */
  emptyMessage?: string
}

/**
 * A text input with our own suggestion list, replacing `<datalist>` — which
 * the browser draws in its own chrome, ignoring the theme, and which cannot
 * show a secondary line or be driven from the keyboard predictably.
 *
 * The field stays free text: a traveller may type a place that is not in the
 * list, and the search still runs. The list only offers.
 *
 * The list floats in shadcn's `Popover`, which portals it above any card
 * that would clip it and flips it upwards when there is no room below. The
 * ranking, the highlighting and the arrow-key model stay ours, because a
 * combobox is not a command palette: the input is the field itself, and
 * Enter with nothing highlighted must submit the form, not pick a row.
 */
export function AutocompleteField({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  icon,
  wrapperClassName,
  emptyMessage = 'No matches',
}: AutocompleteFieldProps) {
  const fieldId = useId()
  const listId = `${fieldId}-list`
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const [open, setOpen] = useState(false)
  // Which option the arrow keys are on. -1 means "none yet", so Enter submits
  // the form with whatever was typed instead of picking a suggestion.
  const [activeIndex, setActiveIndex] = useState(-1)
  // What the person typed, as opposed to the committed `value`. Only set while
  // the list is open so an outside change to `value` still shows through.
  const [query, setQuery] = useState<string | null>(null)

  const text = query ?? value
  const matches = useMemo(
    () => filterOptions(options, query ?? ''),
    [options, query],
  )

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
    setQuery(null)
  }

  // Keep the highlighted row inside the scroll box as the arrows move it.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const commit = (option: AutocompleteOption) => {
    onChange(option.value)
    close()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(0)
        return
      }
      if (matches.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((previous) => {
        const next = previous + step
        if (next < 0) return matches.length - 1
        if (next >= matches.length) return 0
        return next
      })
      return
    }

    if (event.key === 'Enter' && open && activeIndex >= 0 && matches[activeIndex]) {
      // Selecting is not submitting: swallow the Enter that picked the row.
      event.preventDefault()
      commit(matches[activeIndex])
      return
    }

    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close()
      return
    }

    if (event.key === 'Tab') close()
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn('relative', wrapperClassName)}>
          <Shell id={fieldId} label={label} error={error} icon={icon}>
            <Input
              id={fieldId}
              type="text"
              role="combobox"
              className={cn(FIELD_CONTROL, 'truncate')}
              value={text}
              placeholder={placeholder}
              autoComplete="off"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fieldId}-error` : undefined}
              onChange={(event) => {
                setQuery(event.target.value)
                onChange(event.target.value)
                setOpen(true)
                setActiveIndex(-1)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
            />
          </Shell>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={8}
        // The input keeps the focus: this is a suggestion list under a field,
        // not a dialog the traveller has moved into.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // A click back on the field is not a click outside.
        onInteractOutside={(event) => {
          if (anchorRef.current?.contains(event.target as Node)) {
            event.preventDefault()
          }
        }}
        className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden rounded-2xl bg-surface p-0 shadow-lift ring-hairline"
      >
        {matches.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-500">{emptyMessage}</p>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-72 overflow-y-auto overscroll-contain py-1"
          >
            {matches.map((option, index) => {
              const active = index === activeIndex
              const selected = option.value === value

              return (
                <li
                  key={`${option.value}-${option.meta ?? ''}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  // `onMouseDown` rather than `onClick`: the input's blur
                  // would otherwise close the list before the click lands.
                  onMouseDown={(event) => {
                    event.preventDefault()
                    commit(option)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm',
                    active ? 'bg-brand-surface text-brand-fg-strong' : 'text-ink-700',
                  )}
                >
                  <span className="min-w-0 truncate font-semibold">
                    {highlight(option.value, query ?? '')}
                  </span>
                  {option.meta ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-md px-1.5 py-0.5 text-[0.7rem] font-bold tracking-wide',
                        active
                          ? 'bg-surface text-brand-fg'
                          : 'bg-surface-muted text-ink-500',
                      )}
                    >
                      {option.meta}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
