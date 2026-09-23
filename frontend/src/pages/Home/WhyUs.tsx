import { Container, SectionHeading } from '@/components'
import { BRAND, FEATURES } from '@/constants'

export function WhyUs() {
  return (
    <section id="why-us" className="scroll-mt-24 py-16 sm:py-20">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={`Why ${BRAND.name}`}
          title="Built around the parts of travel that usually go wrong"
          description="Refunds that drag on, fares that change at checkout, support that never picks up. We fixed those first."
        />

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon

            return (
              <li
                key={feature.title}
                className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {feature.description}
                </p>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}
