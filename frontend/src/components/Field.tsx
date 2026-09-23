import type { InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { IconComponent } from '@/types/common.types'
import { cn } from '@/utils'

/**
 * The bare control styling, shared with the combobox and the date picker.
 *
 * Every field in the app sits inside `Shell`, which draws the border, the
 * icon and the label. The control itself is therefore borderless: shadcn's
 * `Input` arrives with its own border, height and focus ring, and these
 * classes take all three away so the Shell's ring is the only one.
 */
export const FIELD_CONTROL =
  'h-auto w-full rounded-none border-0 bg-transparent p-0 text-[0.95rem] font-semibold text-ink-900 ' +
  'shadow-none outline-none placeholder:font-normal placeholder:text-ink-400 ' +
  'focus-visible:border-0 focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0 ' +
  'dark:bg-transparent md:text-[0.95rem]'

const SHELL =
  'group relative rounded-2xl bg-surface px-4 py-2.5 text-left ring-1 ring-hairline ' +
  'transition-shadow hover:ring-brand-border focus-within:ring-2 focus-within:ring-brand-500'

/** The invalid state wins over hover, and stays red while focused. */
const SHELL_INVALID =
  'ring-danger-border hover:ring-danger-border focus-within:ring-danger-fg'

const LABEL =
  'block text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase'

/**
 * The bordered box every field shares: icon, label, optional hint and the
 * error line beneath. Exported so the combobox and the date picker sit in the
 * same box as a plain text field rather than reimplementing it.
 */
export function Shell({
  id,
  label,
  hint,
  error,
  icon: Icon,
  className,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  icon?: IconComponent
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <div className={cn(SHELL, error && SHELL_INVALID)}>
        <div className="flex items-center gap-3">
          {Icon ? (
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 transition-colors group-focus-within:text-brand-fg',
                error ? 'text-danger-fg' : 'text-ink-400',
              )}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={id} className={LABEL}>
                {label}
              </Label>
              {hint ? (
                <span className="truncate text-[0.68rem] font-medium text-ink-400">
                  {hint}
                </span>
              ) : null}
            </div>
            {children}
          </div>
        </div>
      </div>
      {/* Outside the ring so it does not stretch the box, and given an id so
          the control can name it as its description for screen readers. */}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 px-1 text-xs font-medium text-danger-fg"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  /** A validation message. When set, the field is drawn as invalid. */
  error?: string
  icon?: IconComponent
  /** Wrapper class — use for grid spans. */
  wrapperClassName?: string
}

export function TextField({
  label,
  hint,
  error,
  icon,
  wrapperClassName,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <Shell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      icon={icon}
      className={wrapperClassName}
    >
      <Input
        id={fieldId}
        className={cn(FIELD_CONTROL, 'relative', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...rest}
      />
    </Shell>
  )
}
