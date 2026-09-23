import { useEffect, useId, useRef, useState } from 'react'

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import type { IconComponent } from '@/types/common.types'
import { cn } from '@/utils'

import { Shell } from './Field'

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, '0'),
)

/**
 * Five-minute steps. A pickup is agreed to the nearest few minutes in
 * practice, and 60 rows per column is a lot of scrolling for no more accuracy.
 */
const MINUTES = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, '0'),
)

/** Splits an `HH:MM` value, tolerating an empty or half-typed one. */
function split(value: string) {
  const [hour = '', minute = ''] = value.split(':')
  return { hour, minute }
}

/** `09:30` -> `9:30 am`, which is how a pickup time is actually spoken here. */
function formatTime(value: string) {
  const { hour, minute } = split(value)
  const hours = Number(hour)
  if (Number.isNaN(hours) || minute === '') return ''
  const suffix = hours < 12 ? 'am' : 'pm'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${minute} ${suffix}`
}

interface TimeFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  icon?: IconComponent
  wrapperClassName?: string
}

/**
 * An `HH:MM` field with our own two-column picker, replacing
 * `<input type="time">`, whose popup the browser paints in its own colours -
 * a light spinner on a dark page - and which differs on every platform.
 *
 * The value stays `HH:MM` so nothing downstream has to change; only the
 * display is turned into "9:30 am". The picker floats in shadcn's `Popover`,
 * which portals and flips it for us.
 */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Select time',
  error,
  icon,
  wrapperClassName,
}: TimeFieldProps) {
  const fieldId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const hourListRef = useRef<HTMLUListElement>(null)
  const minuteListRef = useRef<HTMLUListElement>(null)

  const [open, setOpen] = useState(false)

  const { hour, minute } = split(value)

  // Open with the current hour and minute in view rather than at midnight.
  useEffect(() => {
    if (!open) return
    for (const [list, options, current] of [
      [hourListRef, HOURS, hour],
      [minuteListRef, MINUTES, minute],
    ] as const) {
      const index = options.indexOf(current)
      if (index >= 0) {
        list.current?.children[index]?.scrollIntoView({ block: 'center' })
      }
    }
  }, [open, hour, minute])

  /** Changing one column keeps the other, defaulting the unset half to 00. */
  const pick = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour || '00'}:${nextMinute || '00'}`)
  }

  const column = (
    ref: React.RefObject<HTMLUListElement | null>,
    title: string,
    options: string[],
    current: string,
    onPick: (option: string) => void,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="px-2 pb-1 text-center text-[0.62rem] font-bold tracking-[0.08em] text-ink-400 uppercase">
        {title}
      </p>
      <ul
        ref={ref}
        role="listbox"
        aria-label={title}
        className="flex-1 overflow-y-auto overscroll-contain px-1"
      >
        {options.map((option) => {
          const selected = option === current
          return (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onPick(option)}
                className={cn(
                  'w-full cursor-pointer rounded-lg py-1.5 text-center text-sm font-semibold transition-colors',
                  selected
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-700 hover:bg-brand-surface hover:text-brand-fg-strong',
                )}
              >
                {option}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn('relative', wrapperClassName)}>
          <Shell id={fieldId} label={label} error={error} icon={icon}>
            <button
              id={fieldId}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fieldId}-error` : undefined}
              onClick={() => setOpen((previous) => !previous)}
              className={cn(
                'w-full cursor-pointer truncate bg-transparent p-0 text-left text-[0.95rem] outline-none',
                value ? 'font-semibold text-ink-900' : 'text-ink-400',
              )}
            >
              {formatTime(value) || placeholder}
            </button>
          </Shell>
        </div>
      </PopoverAnchor>

      <PopoverContent
        role="dialog"
        aria-label={label}
        align="start"
        sideOffset={8}
        onInteractOutside={(event) => {
          if (anchorRef.current?.contains(event.target as Node)) {
            event.preventDefault()
          }
        }}
        className="flex h-72 max-h-(--radix-popover-content-available-height) w-44 flex-col gap-0 rounded-2xl bg-surface px-0 py-2 shadow-lift ring-hairline"
      >
        <div className="flex min-h-0 flex-1 gap-1">
            {column(hourListRef, 'Hour', HOURS, hour, (next) =>
              pick(next, minute),
            )}
            <span aria-hidden="true" className="w-px shrink-0 bg-hairline" />
            {column(minuteListRef, 'Min', MINUTES, minute, (next) =>
              pick(hour, next),
            )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
