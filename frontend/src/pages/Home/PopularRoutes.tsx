import { Button, Container, SectionHeading } from '@/components'
import { POPULAR_ROUTES } from '@/constants'
import {
  ArrowRightIcon,
  BusIcon,
  CabIcon,
  ClockIcon,
  PlaneIcon,
  TrainIcon,
} from '@/icons'
import type { IconComponent } from '@/types/common.types'

const MODE_ICON: Record<string, IconComponent> = {
  Bus: BusIcon,
  Train: TrainIcon,
  Flight: PlaneIcon,
  Cab: CabIcon,
}

export function PopularRoutes() {
  return (
    <section
      id="routes"
      className="scroll-mt-24 bg-surface py-16 ring-1 ring-hairline sm:py-20"
    >
      <Container>
        <SectionHeading
          eyebrow="Popular routes"
          title="Where travellers are heading this week"
          description="Fares below are the lowest seen in the last 24 hours."
          action={
            <Button variant="secondary">
              View all routes
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          }
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR_ROUTES.map((route) => {
            const Icon = MODE_ICON[route.mode] ?? BusIcon

            return (
              <li key={`${route.from}-${route.to}-${route.mode}`} className="min-w-0">
                <a
                  href="#top"
                  className="group flex items-center gap-3 rounded-2xl bg-surface-muted p-4 ring-1 ring-transparent transition-all hover:bg-surface hover:shadow-card hover:ring-hairline sm:gap-4 sm:p-5"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-surface text-brand-fg transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-[0.95rem] font-bold text-ink-900">
                      <span className="min-w-0">{route.from}</span>
                      <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-400" />
                      <span className="min-w-0">{route.to}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {route.duration}
                      <span aria-hidden="true">&middot;</span>
                      {route.mode}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-[0.7rem] text-ink-400">
                      from
                    </span>
                    <span className="block text-lg font-extrabold text-ink-900">
                      &#8377;{route.price.toLocaleString('en-IN')}
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}
