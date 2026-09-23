import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { FareLine } from '@/types/common.types'
import { formatINR } from '@/utils'

interface SummaryCardProps {
  title?: string
  /** Per-item rows, rendered above the divider. */
  items?: FareLine[]
  /** Charges, rendered below the divider. */
  charges?: FareLine[]
  total: number
  /** Shown instead of everything else when there is nothing to total yet. */
  emptyMessage?: string
  isEmpty?: boolean
  /** Call to action rendered under the total. */
  children?: ReactNode
}

/** One priced line, shared by the item list and the charges list. */
function Line({ line }: { line: FareLine }) {
  return (
    <>
      <span className="min-w-0 text-ink-500">
        <span className="truncate">{line.label}</span>
        {line.detail ? (
          <span className="ml-1.5 text-xs text-ink-400">{line.detail}</span>
        ) : null}
      </span>
      <span className="shrink-0 font-semibold text-ink-700 tabular-nums">
        {formatINR(line.value)}
      </span>
    </>
  )
}

/**
 * The running total, shown beside every step from selection onwards so the
 * price never changes without the traveller seeing which line moved.
 *
 * On shadcn's `Card`. Its spacing variable is set to the site's card padding
 * and its ring to the hairline, so it matches every other panel on the page.
 */
export function SummaryCard({
  title = 'Fare summary',
  items = [],
  charges = [],
  total,
  emptyMessage,
  isEmpty = false,
  children,
}: SummaryCardProps) {
  return (
    <Card className="gap-0 rounded-3xl py-5 text-base shadow-card ring-hairline [--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="text-base font-bold text-ink-900">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isEmpty ? (
          <p className="mt-3 text-sm text-ink-500">{emptyMessage}</p>
        ) : (
          <>
            {items.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <Line line={item} />
                  </li>
                ))}
              </ul>
            ) : null}

            {charges.length > 0 ? (
              <>
                <Separator className="mt-4 bg-hairline" />
                <dl className="mt-4 space-y-2">
                  {charges.map((charge) => (
                    <div
                      key={charge.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <Line line={charge} />
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            <Separator className="mt-4 bg-hairline" />
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-ink-900">Total payable</span>
              <span className="text-xl font-extrabold text-ink-900 tabular-nums">
                {formatINR(total)}
              </span>
            </div>
          </>
        )}
      </CardContent>

      {children ? (
        <CardFooter className="mt-5 border-0 bg-transparent p-0 px-(--card-spacing)">
          <div className="w-full">{children}</div>
        </CardFooter>
      ) : null}
    </Card>
  )
}
