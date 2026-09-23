import type { ReactNode } from 'react'

import { SummaryCard } from '@/components'
import {
  AC_CLASSES,
  QUOTA_LABELS,
  calculateTrainFare,
} from '@/services/train.services'
import type { FareLine } from '@/types/common.types'
import type { QuotaId, TrainClassOption } from '@/types/train.types'

export function TrainFareSummary({
  classOption,
  quota,
  passengerCount,
  insured,
  children,
}: {
  classOption: TrainClassOption | null
  quota: QuotaId
  passengerCount: number
  insured: boolean
  children?: ReactNode
}) {
  const fare = calculateTrainFare({
    classOption,
    quota,
    passengerCount,
    insured,
  })

  const charges: FareLine[] = [
    {
      label: 'Base fare',
      detail: `${passengerCount} × ${classOption?.code ?? ''}`,
      value: fare.baseFare,
    },
  ]

  // Only surface lines that actually cost something.
  if (fare.quotaSurcharge > 0) {
    charges.push({
      label: `${QUOTA_LABELS[quota]} premium`,
      value: fare.quotaSurcharge,
    })
  }
  charges.push({ label: 'Reservation charge', value: fare.reservationCharge })
  if (fare.insurance > 0) {
    charges.push({ label: 'Travel insurance', value: fare.insurance })
  }
  if (fare.gst > 0) {
    charges.push({ label: 'GST (5%)', value: fare.gst })
  }

  return (
    <SummaryCard
      isEmpty={!classOption || passengerCount === 0}
      emptyMessage="Pick a class to see the fare."
      items={
        classOption
          ? [
              {
                label: classOption.label,
                detail: `per passenger`,
                value: classOption.fare,
              },
            ]
          : []
      }
      charges={charges}
      total={fare.total}
    >
      {classOption && !AC_CLASSES.includes(classOption.code) ? (
        <p className="mb-4 text-xs text-ink-400">
          No GST on non air-conditioned classes.
        </p>
      ) : null}
      {children}
    </SummaryCard>
  )
}
