import { CheckIcon, CloseIcon, LuggageIcon, MinusIcon, UtensilsIcon } from '@/icons'
import type { FareBrand, RuleTier } from '@/types/plane.types'
import { cn, formatINR } from '@/utils'

const TIER_STYLE: Record<RuleTier, { icon: typeof CheckIcon; className: string }> =
  {
    free: {
      icon: CheckIcon,
      className: 'text-emerald-600 dark:text-emerald-400',
    },
    // Better than the base fare but still chargeable — neither tick nor cross.
    reduced: {
      icon: MinusIcon,
      className: 'text-amber-600 dark:text-amber-400',
    },
    fee: { icon: CloseIcon, className: 'text-ink-400' },
  }

function Rule({ tier, children }: { tier: RuleTier; children: string }) {
  const { icon: Icon, className } = TIER_STYLE[tier]

  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', className)} />
      <span className={tier === 'fee' ? 'text-ink-400' : 'text-ink-600'}>
        {children}
      </span>
    </li>
  )
}

/**
 * One fare family. Brands differ on baggage and change rules, not on the
 * flight, so the rules are what the traveller is actually choosing between.
 */
export function FareBrandCard({
  fare,
  selected,
  onSelect,
  cta = 'Select',
}: {
  fare: FareBrand
  selected?: boolean
  onSelect: () => void
  cta?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full cursor-pointer flex-col rounded-2xl p-4 text-left ring-1 transition-all',
        selected
          ? 'bg-brand-surface ring-2 ring-brand-500'
          : 'bg-surface-muted ring-hairline hover:-translate-y-0.5 hover:shadow-card hover:ring-brand-500',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink-900">{fare.name}</span>
        <span className="text-base font-extrabold text-ink-900 tabular-nums">
          {formatINR(fare.price)}
        </span>
      </span>

      <ul className="mt-3 flex-1 space-y-1.5">
        <li className="flex items-start gap-2 text-xs">
          <LuggageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          <span className="text-ink-600">
            {fare.cabinBaggageKg} kg cabin &middot; {fare.checkInBaggageKg} kg
            check-in
          </span>
        </li>
        <li className="flex items-start gap-2 text-xs">
          <UtensilsIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          <span className={fare.mealIncluded ? 'text-ink-600' : 'text-ink-400'}>
            {fare.mealIncluded ? 'Meal included' : 'Meal not included'}
          </span>
        </li>
        <Rule tier={fare.freeSeat ? 'free' : 'fee'}>
          {fare.freeSeat ? 'Free seat selection' : 'Seat selection chargeable'}
        </Rule>
        <Rule tier={fare.cancellationTier}>{fare.cancellation}</Rule>
        <Rule tier={fare.dateChangeTier}>{fare.dateChange}</Rule>
      </ul>

      <span
        className={cn(
          'mt-4 block rounded-full py-2 text-center text-xs font-bold transition-colors',
          selected
            ? 'bg-brand-600 text-white'
            : 'bg-surface text-brand-fg ring-1 ring-hairline',
        )}
      >
        {selected ? 'Selected' : cta}
      </span>
    </button>
  )
}
