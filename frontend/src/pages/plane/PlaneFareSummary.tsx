import type { ReactNode } from 'react'

import { SummaryCard } from '@/components'
import { calculatePlaneFare } from '@/services/plane.services'
import type { FareLine } from '@/types/common.types'
import type { AddOnId, FareBrand } from '@/types/plane.types'

export function PlaneFareSummary({
  fareBrand,
  travellerCount,
  seatTotal,
  addOns,
  children,
}: {
  fareBrand: FareBrand | null
  travellerCount: number
  seatTotal: number
  addOns: AddOnId[]
  children?: ReactNode
}) {
  const fare = calculatePlaneFare({
    fareBrand,
    travellerCount,
    seatTotal,
    addOnIds: addOns,
  })

  const charges: FareLine[] = [
    {
      label: 'Base fare',
      detail: `${travellerCount} × ${fareBrand?.name ?? ''}`,
      value: fare.baseFare,
    },
    { label: 'Taxes & surcharges', value: fare.taxes },
  ]

  // Only surface lines that actually cost something.
  if (fare.seats > 0) charges.push({ label: 'Seats', value: fare.seats })
  if (fare.addOns > 0) charges.push({ label: 'Add-ons', value: fare.addOns })
  charges.push({ label: 'Convenience fee', value: fare.convenienceFee })

  return (
    <SummaryCard
      isEmpty={!fareBrand || travellerCount === 0}
      emptyMessage="Pick a fare to see the price."
      items={
        fareBrand
          ? [
              {
                label: `${fareBrand.name} fare`,
                detail: 'per traveller',
                value: fareBrand.price,
              },
            ]
          : []
      }
      charges={charges}
      total={fare.total}
    >
      {children}
    </SummaryCard>
  )
}
