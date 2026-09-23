import type { ReactNode } from 'react'
import { useId } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/utils'

/**
 * The pieces every results filter panel is built from.
 *
 * The bus, train, flight and stay panels each used to carry their own copy of
 * these two — the same twenty lines four times, with the same native
 * `<input type="checkbox">` that the browser paints in its own colours. One
 * copy now, on shadcn's `Checkbox`, which draws the same box in both themes
 * and carries the focus ring.
 */

/** One filter option: a checkbox, its label and an optional match count. */
export function FilterCheckboxRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: ReactNode
  /** How many results this option matches; omitted where it is not known. */
  count?: number
  checked: boolean
  onChange: () => void
}) {
  const id = useId()

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-ink-600 transition-colors hover:text-ink-900"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="cursor-pointer rounded-[5px] border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count === undefined ? null : (
        <span className="text-xs text-ink-400 tabular-nums">{count}</span>
      )}
    </label>
  )
}

/** A titled group of options inside a panel. */
export function FilterGroup({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-t border-hairline px-5 py-4 first:border-t-0', className)}>
      <h3 className="text-xs font-bold tracking-wide text-ink-500 uppercase">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}
