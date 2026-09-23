import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'
import { BRAND, FOOTER_COLUMNS, FOOTER_TARGETS, SOCIAL_LINKS } from '@/constants'
import { MailIcon, PhoneIcon } from '@/icons'
import type { NavTarget } from '@/types/home.types'

export function Footer({
  onNavigate,
}: {
  /**
   * Given on pages that can route, it turns the footer links that have a
   * destination into real ones. The rest stay placeholder anchors.
   */
  onNavigate?: (target: NavTarget) => void
} = {}) {
  return (
    <footer className="bg-footer text-footer-fg print:hidden">
      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">
              {BRAND.tagline} Book buses, trains, flights, hotels and cabs from
              a single account.
            </p>

            <div className="mt-5 space-y-2 text-sm">
              <a
                href={`tel:${BRAND.supportPhone.replace(/\s/g, '')}`}
                className="flex items-center gap-2.5 transition-colors hover:text-white"
              >
                <PhoneIcon className="h-4 w-4" />
                {BRAND.supportPhone}
              </a>
              <a
                href={`mailto:${BRAND.supportEmail}`}
                className="flex items-center gap-2.5 transition-colors hover:text-white"
              >
                <MailIcon className="h-4 w-4" />
                {BRAND.supportEmail}
              </a>
            </div>

            <ul className="mt-6 flex gap-2.5">
              {SOCIAL_LINKS.map(({ label, icon: Icon }) => (
                <li key={label}>
                  <a
                    href="#top"
                    aria-label={label}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/8 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-bold tracking-wide text-white uppercase">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {column.links.map((link) => {
                    const target = onNavigate ? FOOTER_TARGETS[link] : undefined

                    return (
                      <li key={link}>
                        {target ? (
                          <button
                            type="button"
                            onClick={() => onNavigate?.(target)}
                            className="cursor-pointer transition-colors hover:text-white"
                          >
                            {link}
                          </button>
                        ) : (
                          <a
                            href="#top"
                            className="transition-colors hover:text-white"
                          >
                            {link}
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {BRAND.name} Travel Pvt. Ltd. All
            rights reserved.
          </p>
          <p>Made for travellers in India.</p>
        </div>
      </Container>
    </footer>
  )
}
