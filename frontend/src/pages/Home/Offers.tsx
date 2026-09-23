import { useState } from 'react'

import { Container, SectionHeading } from '@/components'
import { OFFERS } from '@/constants'
import { CheckIcon } from '@/icons'
import { cn } from '@/utils'

export function Offers() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      // Clipboard is unavailable (insecure origin, denied permission) — the
      // code is on screen anyway, so there is nothing to recover from.
    }
  }

  return (
    <section id="offers" className="scroll-mt-24 py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Offers"
          title="Deals worth booking early for"
          description="Apply a code at checkout. One offer per booking, and they stack with partner bank discounts."
        />

        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {OFFERS.map((offer) => {
            const Icon = offer.icon
            const isCopied = copied === offer.code

            return (
              <li
                key={offer.code}
                className={cn(
                  'group relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-card',
                  offer.accent,
                )}
              >
                <div
                  aria-hidden="true"
                  className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 transition-transform duration-300 group-hover:scale-125"
                />

                <Icon className="relative h-8 w-8" />

                <h3 className="relative mt-5 text-lg leading-snug font-bold text-white">
                  {offer.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-white">
                  {offer.description}
                </p>

                <button
                  type="button"
                  onClick={() => copyCode(offer.code)}
                  className="relative mt-6 flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-white/40 bg-white/10 px-4 py-3 text-left transition-colors hover:bg-white/20"
                >
                  <span className="font-mono text-sm font-bold tracking-[0.12em]">
                    {offer.code}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {isCopied ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      'Copy code'
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}
