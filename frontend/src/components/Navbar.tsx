import { useState } from 'react'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'
import { NavMenu, NavMenuAccordion } from '@/components/NavMenu'
import { ProfileMenu } from '@/components/ProfileMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { BRAND, NAV_MENUS } from '@/constants'
import { useAuth, useScrolled } from '@/hooks'
import { MenuIcon, PhoneIcon, UserIcon } from '@/icons'
import type { AuthMode } from '@/types/auth.types'
import type { NavTarget } from '@/types/home.types'
import { cn } from '@/utils'

export function Navbar({
  onAuth,
  onOpenAccount,
  onNavigate,
  activeMenu,
}: {
  onAuth: (mode: AuthMode) => void
  /** Opens the account page. The navbar routes through the app, not itself. */
  onOpenAccount: () => void
  /**
   * Handles every item in the four menus.
   *
   * The navbar knows what was picked, not where it lives: half the targets
   * are sections of the home page and half are standalone pages, and only
   * the app knows which of those is currently on screen.
   */
  onNavigate: (target: NavTarget) => void
  /** Label of the menu the current page belongs to, highlighted in the bar. */
  activeMenu?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const scrolled = useScrolled()
  const { signedIn } = useAuth()

  const openAccount = () => {
    setMenuOpen(false)
    onOpenAccount()
  }

  const navigate = (target: NavTarget) => {
    setMenuOpen(false)
    setOpenMenu(null)
    onNavigate(target)
  }

  const openAuth = (mode: AuthMode) => {
    setMenuOpen(false)
    onAuth(mode)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-surface/95 backdrop-blur-md transition-shadow duration-200',
        // A hairline under the bar, so its bottom edge is a deliberate line
        // rather than the seam where a pale bar happens to meet the hero
        // photo. It is hidden once the shadow takes over that job.
        'border-b border-hairline',
        'print:hidden',
        scrolled ? 'border-transparent shadow-card' : 'shadow-none',
      )}
    >
      <Container>
        <div className="flex h-18 items-center justify-between gap-6">
          <Logo onNavigate={() => navigate({ kind: 'section', id: 'top' })} />

          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 lg:flex"
            // One Escape closes whichever menu is open, wherever the focus is
            // inside the bar.
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpenMenu(null)
            }}
          >
            {NAV_MENUS.map((menu) => (
              <NavMenu
                key={menu.label}
                menu={menu}
                open={openMenu === menu.label}
                active={activeMenu === menu.label}
                onOpen={() => setOpenMenu(menu.label)}
                onClose={() => setOpenMenu(null)}
                onSelect={navigate}
              />
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <a
              href={`tel:${BRAND.supportPhone.replace(/\s/g, '')}`}
              className="mr-1 inline-flex items-center gap-2 text-sm font-semibold text-ink-600 transition-colors hover:text-ink-900"
            >
              <PhoneIcon className="h-4 w-4" />
              {BRAND.supportPhone}
            </a>
            <ThemeToggle />
            {signedIn ? (
              <ProfileMenu onOpenAccount={openAccount} />
            ) : (
              <>
                <Button variant="secondary" onClick={() => openAuth('login')}>
                  <UserIcon className="h-4 w-4" />
                  Log in
                </Button>
                <Button onClick={() => openAuth('signup')}>Sign up</Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            {/* The mobile menu is a Sheet from the right: focus-trapped,
                scroll-locked and closable with Escape or a tap on the page,
                which the old inline panel under the bar had none of. */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                aria-label="Open menu"
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-surface text-ink-700 ring-1 ring-hairline transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <MenuIcon className="h-5 w-5" />
              </SheetTrigger>

              <SheetContent
                side="right"
                className="w-[min(100vw-2rem,24rem)] gap-0 border-0 bg-surface p-0 text-base shadow-lift ring-1 ring-hairline sm:max-w-none"
              >
                <SheetHeader className="border-b border-hairline px-5 py-4 pr-14">
                  <SheetTitle className="text-base font-bold text-ink-900">
                    Menu
                  </SheetTitle>
                  <SheetDescription className="text-xs text-ink-500">
                    Book, learn about us, or find the legal pages.
                  </SheetDescription>
                </SheetHeader>

                <nav
                  aria-label="Mobile"
                  className="flex-1 overflow-y-auto p-3"
                >
                  {NAV_MENUS.map((menu) => (
                    <NavMenuAccordion
                      key={menu.label}
                      menu={menu}
                      open={openSection === menu.label}
                      onToggle={() =>
                        setOpenSection((current) =>
                          current === menu.label ? null : menu.label,
                        )
                      }
                      onSelect={navigate}
                    />
                  ))}
                </nav>

                <div className="border-t border-hairline p-4">
                  {signedIn ? (
                    <Button fullWidth onClick={openAccount}>
                      My bookings
                    </Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => openAuth('login')}>
                        Log in
                      </Button>
                      <Button onClick={() => openAuth('signup')}>Sign up</Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </Container>
    </header>
  )
}
