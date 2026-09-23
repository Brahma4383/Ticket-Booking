import { useId, useMemo, useRef, useState } from 'react'

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import { ChevronLeftIcon, ChevronRightIcon } from '@/icons'
import type { IconComponent } from '@/types/common.types'
import { cn, formatLongDate, toInputDate } from '@/utils'

import { Shell } from './Field'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Calendar arithmetic runs on local midnight `Date`s and every value crossing
 * the component's edge is a `YYYY-MM-DD` string, so nothing here ever touches
 * UTC and shifts a journey to the day before.
 */
function toLocalDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toValue(date: Date) {
  return date.toLocaleDateString('en-CA')
}

/**
 * The 42 cells of a month grid: the days of `month`, padded at both ends with
 * the neighbouring months so every row is full and the columns stay aligned.
 */
function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { date, inMonth: date.getMonth() === month }
  })
}

interface DateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Earliest selectable day, `YYYY-MM-DD`. Defaults to today. */
  min?: string
  /** Latest selectable day, `YYYY-MM-DD`. Open-ended when omitted. */
  max?: string
  placeholder?: string
  error?: string
  icon?: IconComponent
  wrapperClassName?: string
}

/**
 * A date field with our own calendar instead of `<input type="date">`, whose
 * picker each browser draws differently — and which on desktop Chrome is a
 * light panel no matter what the page theme says.
 *
 * The trigger is a button, not an input: the only way to set a date is to pick
 * one, so a journey date can never be half-typed or out of range.
 *
 * The calendar floats in shadcn's `Popover`: portalled, so a card cannot clip
 * it, and flipped above the field when there is no room beneath — which is
 * what the hand-measured placement used to do.
 */
export function DateField({
  label,
  value,
  onChange,
  min = toInputDate(),
  max,
  placeholder = 'Select date',
  error,
  icon,
  wrapperClassName,
}: DateFieldProps) {
  const fieldId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = value ? toLocalDate(value) : null
  const today = toInputDate()

  // The month on show. Opens on the selected date, else on the first month
  // that has a selectable day in it.
  const [cursor, setCursor] = useState(() => {
    const base = selected ?? toLocalDate(min) ?? new Date()
    return { year: base.getFullYear(), month: base.getMonth() }
  })

  const grid = useMemo(
    () => buildGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )

  const shiftMonth = (step: number) => {
    setCursor((previous) => {
      const next = new Date(previous.year, previous.month + step, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const openPicker = () => {
    // Reopening always lands back on the chosen month, however far the arrows
    // wandered last time.
    const base = selected ?? toLocalDate(min) ?? new Date()
    setCursor({ year: base.getFullYear(), month: base.getMonth() })
    setOpen(true)
  }

  // Month arrows stop rather than scrolling into a month with no open days.
  const lastOfMonth = toValue(new Date(cursor.year, cursor.month + 1, 0))
  const firstOfMonth = toValue(new Date(cursor.year, cursor.month, 1))
  const canGoBack = !min || firstOfMonth > min
  const canGoForward = !max || lastOfMonth < max

  return (
    <Popover open={open} onOpenChange={(next) => (next ? openPicker() : setOpen(false))}>
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
              onClick={() => (open ? setOpen(false) : openPicker())}
              className={cn(
                'w-full cursor-pointer truncate bg-transparent p-0 text-left text-[0.95rem] outline-none',
                value ? 'font-semibold text-ink-900' : 'text-ink-400',
              )}
            >
              {value ? formatLongDate(value) : placeholder}
            </button>
          </Shell>
        </div>
      </PopoverAnchor>

      <PopoverContent
        role="dialog"
        aria-label={label}
        align="start"
        sideOffset={8}
        // A click back on the field toggles it from its own handler; the
        // popover must not also count that as a click outside and close.
        onInteractOutside={(event) => {
          if (anchorRef.current?.contains(event.target as Node)) {
            event.preventDefault()
          }
        }}
        className="w-[19rem] max-w-[calc(100vw-2rem)] gap-0 rounded-2xl bg-surface p-3 shadow-lift ring-hairline"
      >
        <div>
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full text-ink-500 transition-colors',
                canGoBack
                  ? 'cursor-pointer hover:bg-surface-muted hover:text-ink-900'
                  : 'cursor-not-allowed opacity-40',
              )}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <p
              aria-live="polite"
              className="text-sm font-bold text-ink-900"
            >
              {MONTHS[cursor.month]} {cursor.year}
            </p>

            <button
              type="button"
              disabled={!canGoForward}
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full text-ink-500 transition-colors',
                canGoForward
                  ? 'cursor-pointer hover:bg-surface-muted hover:text-ink-900'
                  : 'cursor-not-allowed opacity-40',
              )}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 px-1 pb-1">
            {WEEKDAYS.map((day, index) => (
              <span
                key={`${day}-${index}`}
                aria-hidden="true"
                className="grid h-7 place-items-center text-[0.68rem] font-bold tracking-wide text-ink-400 uppercase"
              >
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 px-1 pb-1">
            {grid.map(({ date, inMonth }) => {
              const cell = toValue(date)
              const disabled = (min && cell < min) || (max && cell > max)
              const isSelected = cell === value
              const isToday = cell === today

              return (
                <button
                  key={cell}
                  type="button"
                  disabled={Boolean(disabled)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  aria-label={date.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  onClick={() => {
                    onChange(cell)
                    setOpen(false)
                  }}
                  className={cn(
                    'grid h-9 place-items-center rounded-xl text-sm font-semibold transition-colors',
                    disabled
                      ? 'cursor-not-allowed text-ink-400/50'
                      : 'cursor-pointer hover:bg-brand-surface hover:text-brand-fg-strong',
                    // Days spilling in from the next month stay legible but
                    // recede, so the current month reads as one block.
                    !inMonth && !disabled && 'text-ink-400',
                    inMonth && !disabled && !isSelected && 'text-ink-900',
                    isToday && !isSelected && 'ring-1 ring-brand-border',
                    isSelected &&
                      'bg-brand-600 text-white hover:bg-brand-600 hover:text-white',
                  )}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
