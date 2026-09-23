import { Button, Container } from '@/components'
import { BRAND, SUPPORT_HIGHLIGHTS } from '@/constants'
import { useOpenChat } from '@/hooks'
import { ChatIcon, PhoneIcon } from '@/icons'
import type { AuthMode } from '@/types/auth.types'
import { cn } from '@/utils'

export function Support({ onAuth }: { onAuth: (mode: AuthMode) => void }) {
  const openChat = useOpenChat()

  return (
    <section id="support" className="scroll-mt-24 pb-20">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-12 sm:px-12 sm:py-14">
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-10 h-64 w-64 rounded-full bg-white/10 blur-2xl"
          />

          <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="max-w-lg text-3xl leading-tight text-white sm:text-[2.1rem]">
                Stuck mid-journey? We answer in under a minute.
              </h2>
              <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed text-white/80">
                Create a free account to track bookings, save travellers and
                reach support without repeating your PNR every time.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={() => onAuth('signup')}
                >
                  Create free account
                </Button>
                <button
                  type="button"
                  onClick={openChat}
                  className="inline-flex h-14 cursor-pointer items-center justify-center gap-2.5 rounded-full px-7 text-base font-semibold whitespace-nowrap text-white ring-1 ring-white/35 transition-colors hover:bg-white/10"
                >
                  <ChatIcon className="h-5 w-5" />
                  Chat with us
                </button>
                <a
                  href={`tel:${BRAND.supportPhone.replace(/\s/g, '')}`}
                  className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full px-7 text-base font-semibold whitespace-nowrap text-white ring-1 ring-white/35 transition-colors hover:bg-white/10"
                >
                  <PhoneIcon className="h-5 w-5" />
                  {BRAND.supportPhone}
                </a>
              </div>
            </div>

            <ul className="space-y-4">
              {SUPPORT_HIGHLIGHTS.map((item) => {
                const Icon = item.icon

                // The card about chatting opens the chat. The rest are
                // statements, and a div that looks pressable but is not is
                // worse than one that plainly is not.
                const Card = item.opensChat ? 'button' : 'div'

                return (
                  <li key={item.title}>
                    <Card
                      {...(item.opensChat
                        ? { type: 'button' as const, onClick: openChat }
                        : {})}
                      className={cn(
                        'flex w-full gap-4 rounded-2xl bg-white/10 p-5 text-left ring-1 ring-white/15 backdrop-blur-sm',
                        item.opensChat &&
                          'cursor-pointer transition-colors hover:bg-white/20 hover:ring-white/30',
                      )}
                    >
                      <Icon className="h-6 w-6 shrink-0 text-accent-400" />
                      <div>
                        <h3 className="text-base text-white">{item.title}</h3>
                        <p className="mt-1 text-sm text-white/80">
                          {item.description}
                        </p>
                        {item.opensChat ? (
                          <span className="mt-2 inline-block text-sm font-semibold text-accent-400">
                            Start a chat →
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  )
}
