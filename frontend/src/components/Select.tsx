import { useId } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IconComponent } from '@/types/common.types'
import { cn } from '@/utils'

import { Shell } from './Field'

interface SelectFieldProps {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  error?: string
  icon?: IconComponent
  wrapperClassName?: string
  /**
   * Mirrors the choice into a hidden input so a plain, uncontrolled `<form>`
   * still submits it. Radix does this itself when given a `name`.
   */
  name?: string
  disabled?: boolean
}

/**
 * A select in our own box, on shadcn's `Select`.
 *
 * Radix supplies what the old hand-rolled listbox had to build: the keyboard
 * model, typeahead, the click-outside, the flip when there is no room below,
 * and a portal so the list is never clipped by a card. What stays ours is the
 * `Shell` around the trigger, so a select sits in the same bordered box as a
 * text field, and the API — `options` are plain strings and `onChange` hands
 * back the chosen string, so call sites read exactly as they did.
 */
export function SelectField({
  label,
  options,
  value,
  onChange,
  error,
  icon,
  wrapperClassName,
  name,
  disabled,
}: SelectFieldProps) {
  const fieldId = useId()

  return (
    <div className={cn('relative', wrapperClassName)}>
      <Shell id={fieldId} label={label} error={error} icon={icon}>
        <Select
          // Radix reserves the empty string for "nothing selected", so an
          // empty value is passed as undefined and shows the first option.
          value={value || undefined}
          onValueChange={onChange}
          name={name}
          disabled={disabled}
        >
          <SelectTrigger
            id={fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={cn(
              // The Shell draws the box; the trigger is just the text and the
              // chevron, so every border, height and ring shadcn gives it is
              // taken back here.
              'h-auto w-full cursor-pointer justify-between rounded-none border-0 bg-transparent p-0',
              'text-[0.95rem] font-semibold text-ink-900 shadow-none',
              'focus-visible:border-0 focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0',
              'data-[size=default]:h-auto dark:bg-transparent dark:hover:bg-transparent',
              'disabled:cursor-not-allowed disabled:text-ink-400 disabled:opacity-100',
              '*:data-[slot=select-value]:truncate',
            )}
          >
            <SelectValue placeholder={options[0] ?? ''} />
          </SelectTrigger>

          <SelectContent
            position="popper"
            align="start"
            className="rounded-2xl bg-surface shadow-lift ring-1 ring-hairline"
          >
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 focus:bg-brand-surface focus:text-brand-fg-strong"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Shell>
    </div>
  )
}
