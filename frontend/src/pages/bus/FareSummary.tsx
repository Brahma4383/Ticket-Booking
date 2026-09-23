import type { ReactNode } from 'react'

import { SummaryCard } from '@/components'
import { calculateFare } from '@/services/bus.services'
import type { Seat } from '@/types/bus.types'

/** Bus fare breakdown: one row per chosen seat, then the charges. */
export function FareSummary({
  seats,
  children,
}: {
  seats: Seat[]
  children?: ReactNode
}) {
  const fare = calculateFare(seats)

  return (
    <SummaryCard
      isEmpty={seats.length === 0}
      emptyMessage="Pick a seat to see the fare."
      items={seats.map((seat) => ({
        label: `Seat ${seat.id}`,
        detail: seat.deck === 'lower' ? '(lower)' : '(upper)',
        value: seat.price,
      }))}
      charges={[
        {
          label: `Seat fare (${seats.length} seat${seats.length === 1 ? '' : 's'})`,
          value: fare.seatTotal,
        },
        { label: 'Service fee', value: fare.serviceFee },
        { label: 'GST (5%)', value: fare.gst },
      ]}
      total={fare.total}
    >
      {children}
    </SummaryCard>
  )
}
