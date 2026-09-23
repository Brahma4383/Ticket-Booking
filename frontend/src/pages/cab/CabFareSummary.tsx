import type { ReactNode } from 'react'

import { SummaryCard } from '@/components'
import { calculateCabFare } from '@/services/cab.services'
import type { FareLine } from '@/types/common.types'
import type { CabExtraId, CabOption, TripEstimate } from '@/types/cab.types'
import { formatINR } from '@/utils'

export function CabFareSummary({
  option,
  estimate,
  extras,
  children,
}: {
  option: CabOption | null
  /** Null until the server's estimate arrives; the fare reads zero then. */
  estimate: TripEstimate | null
  extras: CabExtraId[]
  children?: ReactNode
}) {
  const fare = calculateCabFare({ option, estimate, extraIds: extras })

  const charges: FareLine[] = [
    {
      label: 'Base fare',
      detail: option ? `${option.includedKm} km included` : undefined,
      value: fare.baseFare,
    },
  ]

  // Only surface the lines that actually apply to this trip.
  if (fare.extras > 0) charges.push({ label: 'Extras', value: fare.extras })
  if (fare.driverAllowance > 0) {
    charges.push({ label: 'Driver allowance', value: fare.driverAllowance })
  }
  if (fare.tollsAndStateTax > 0) {
    charges.push({
      label: 'Tolls & state tax',
      detail: 'estimated',
      value: fare.tollsAndStateTax,
    })
  }
  if (fare.nightCharge > 0) {
    charges.push({ label: 'Night charge', value: fare.nightCharge })
  }
  charges.push({ label: 'GST (5%)', value: fare.gst })

  return (
    <SummaryCard
      isEmpty={!option}
      emptyMessage="Pick a cab to see the fare."
      charges={charges}
      total={fare.total}
    >
      {option ? (
        <div className="mb-4 space-y-2 rounded-2xl bg-surface-muted p-4">
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-ink-900">Pay now</span>
            <span className="font-bold text-ink-900 tabular-nums">
              {formatINR(fare.payNow)}
            </span>
          </p>
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-500">Pay the driver</span>
            <span className="font-semibold text-ink-700 tabular-nums">
              {formatINR(fare.payToDriver)}
            </span>
          </p>
          <p className="text-xs text-ink-400">
            A 20% advance confirms the cab. The balance is settled at the end of
            the trip, along with any extra kilometres at{' '}
            {formatINR(option.extraKmRate)}/km.
          </p>
        </div>
      ) : null}
      {children}
    </SummaryCard>
  )
}
