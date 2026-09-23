import type { ReactNode } from 'react'

import { SummaryCard } from '@/components'
import { calculateStayFare } from '@/services/hotel.services'
import type { FareLine } from '@/types/common.types'
import type { RatePlan } from '@/types/hotel.types'
import { formatINR } from '@/utils'

export function HotelFareSummary({
  ratePlan,
  nights,
  rooms,
  children,
}: {
  ratePlan: RatePlan | null
  nights: number
  rooms: number
  children?: ReactNode
}) {
  const fare = calculateStayFare({ ratePlan, nights, rooms })

  const charges: FareLine[] = [
    {
      label: 'Room charges',
      detail: `${nights} night${nights === 1 ? '' : 's'} × ${rooms} room${rooms === 1 ? '' : 's'}`,
      value: fare.roomTotal,
    },
    { label: `Taxes (${fare.taxRatePercent}%)`, value: fare.taxes },
    { label: 'Property service fee', value: fare.propertyFee },
  ]

  return (
    <SummaryCard
      isEmpty={!ratePlan}
      emptyMessage="Pick a room to see the price."
      items={
        ratePlan
          ? [
              {
                label: ratePlan.name,
                detail: 'per night',
                value: ratePlan.pricePerNight,
              },
            ]
          : []
      }
      charges={charges}
      total={fare.total}
    >
      {ratePlan?.payAtHotel ? (
        <p className="mb-4 rounded-2xl bg-emerald-500/12 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
          Pay {formatINR(fare.total)} at the property. Nothing is charged now.
        </p>
      ) : null}
      {children}
    </SummaryCard>
  )
}
