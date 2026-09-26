import { useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'

import {
  AuthModal,
  Button,
  ChatWidget,
  Container,
  Footer,
  Navbar,
} from '@/components'
import { AuthProvider, ChatProvider, useAuth } from '@/hooks'
import { About } from '@/pages/about'
import { Account } from '@/pages/account'
import { Careers } from '@/pages/careers'
import { Newsroom } from '@/pages/newsroom'
import { Legal } from '@/pages/legal'
import { ResetPassword } from '@/pages/reset-password'
import { Home } from '@/pages/Home'
import type { SearchSubmission } from '@/pages/Home/SearchPanel'
import { BusBooking } from '@/pages/bus'
import { CabBooking } from '@/pages/cab'
import { HotelBooking } from '@/pages/hotel'
import { PlaneBooking } from '@/pages/plane'
import { TrainBooking } from '@/pages/train'
import type { NavTarget } from '@/types/home.types'
import { toInputDate } from '@/utils'

/* ==================================================================
   The whole site's routing lives in this file.

   Every view has a URL, so the browser Back button, bookmarks and shared
   links all work:

     /                      home  (?mode=train selects a search tab,
                                   #offers scrolls to a section)
     /account               the traveller's bookings
     /reset-password        ?uid&token, from the emailed reset link
     /about  /careers
     /newsroom  /legal      standalone pages  (#story, #privacy, ... scroll
                                                to one of their sections)
     /bus    ?from&to&date
     /train  ?from&to&date
     /plane  ?from&to&date&travellers
     /hotel  ?city&checkIn&checkOut&guests
     /cab    ?pickup&drop&date&time
     *                      not found

   A booking flow carries its search in the query string rather than in
   router state, so the URL alone is enough to reopen it. A flow reached
   without the parameters it needs has nothing to search for, so it
   redirects home instead of rendering an empty results list.
   ================================================================== */

/** Every mode that has a booking flow behind it. */
const BOOKABLE = ['bus', 'train', 'plane', 'hotel', 'cab'] as const

type BookableMode = (typeof BOOKABLE)[number]

const isBookable = (mode: string): mode is BookableMode =>
  (BOOKABLE as readonly string[]).includes(mode)

/** "2 Travellers" / "5+ Travellers" / "3 Guests" -> 2 / 5 / 3. */
function parseCount(value: string | undefined | null) {
  const count = Number.parseInt(value ?? '', 10)
  return Number.isFinite(count) && count > 0 ? count : 1
}

/**
 * Where a nav target points.
 *
 * The header and footer still hand back a `NavTarget` — a description of
 * the destination rather than a URL — so this is the one place that knows
 * how those destinations are spelled as paths.
 */
function hrefFor(target: NavTarget): string {
  switch (target.kind) {
    case 'account':
      return '/account'
    case 'page':
      return `/${target.page}${target.section ? `#${target.section}` : ''}`
    case 'mode':
      return `/?mode=${encodeURIComponent(target.id)}`
    case 'section':
      return target.id === 'top' ? '/' : `/#${target.id}`
  }
}

/** The search params a submitted search becomes, per mode. */
function searchParamsFor(
  mode: BookableMode,
  { from, to, date, values }: SearchSubmission,
): URLSearchParams {
  if (mode === 'hotel') {
    return new URLSearchParams({
      city: values.city ?? '',
      checkIn: values.checkIn || toInputDate(),
      checkOut: values.checkOut || toInputDate(1),
      guests: String(parseCount(values.guests)),
    })
  }

  if (mode === 'cab') {
    return new URLSearchParams({
      pickup: values.pickup ?? '',
      drop: values.drop ?? '',
      date: values.date || toInputDate(),
      time: values.time || '09:00',
    })
  }

  const params = new URLSearchParams({ from, to, date })
  if (mode === 'plane') {
    params.set('travellers', String(parseCount(values.travellers)))
  }
  return params
}

/** The hook every route uses to turn a `NavTarget` into a navigation. */
function useNavigateTarget() {
  const navigate = useNavigate()
  return (target: NavTarget) => navigate(hrefFor(target))
}

/**
 * The current `#fragment`, as the standalone pages want it.
 *
 * They take a section id and scroll to it themselves once mounted, since the
 * element does not exist until they have rendered — which is also why the
 * browser's own fragment handling cannot do this job.
 */
function useSection() {
  const { hash } = useLocation()
  return hash ? decodeURIComponent(hash.slice(1)) : undefined
}

/**
 * A new page starts at the top.
 *
 * Only on a change of path: a change of query string is the same page with
 * a different search (a booking step, a selected tab), and those manage
 * their own scrolling. A fragment is left alone so the target page can
 * scroll to its section.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, behavior: 'auto' })
    // `hash` is deliberately not a dependency: it should suppress the jump on
    // arrival, not re-run the effect when a page updates it.
  }, [pathname])

  return null
}

export default function App() {
  return (
    // Both providers sit outside the router so what they hold survives every
    // navigation: the session, and whether the support chat is open. The auth
    // provider owns the sign-in dialog too, because the thing that most needs
    // to open it is the payment step, several levels inside a booking flow.
    <AuthProvider>
      <ChatProvider>
        <BrowserRouter>
          <ScrollToTop />

          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/account" element={<AccountRoute />} />
            <Route path="/reset-password" element={<ResetPasswordRoute />} />

            <Route path="/about" element={<AboutRoute />} />
            <Route path="/careers" element={<CareersRoute />} />
            <Route path="/newsroom" element={<NewsroomRoute />} />
            <Route path="/legal" element={<LegalRoute />} />

            <Route path="/bus" element={<BusRoute />} />
            <Route path="/train" element={<TrainRoute />} />
            <Route path="/plane" element={<PlaneRoute />} />
            <Route path="/hotel" element={<HotelRoute />} />
            <Route path="/cab" element={<CabRoute />} />

            <Route path="*" element={<NotFoundRoute />} />
          </Routes>

          <AuthModal />
          {/* On every route, above everything, and out of the way until it
              is asked for. */}
          <ChatWidget />
        </BrowserRouter>
      </ChatProvider>
    </AuthProvider>
  )
}

/* ------------------------------------------------------------------
   Home
   ------------------------------------------------------------------ */

function HomeRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()
  const [params] = useSearchParams()
  const { hash, key } = useLocation()

  // A search becomes a URL; the flow reads its inputs back out of it.
  const handleSearch = (modeId: string, submission: SearchSubmission) => {
    if (!isBookable(modeId)) return false
    navigate(`/${modeId}?${searchParamsFor(modeId, submission)}`)
    return true
  }

  // `?mode=train`, from the header's Booking menu, selects that tab in the
  // search panel. The history entry's key is what makes picking the same
  // mode a second time register, since the panel reacts to a change rather
  // than to a value, and the URL is identical both times.
  const mode = params.get('mode')
  const modeRequest = mode ? { id: mode, seq: key } : null

  // Arriving at `/#offers` from another page: the section only exists once
  // the home page has rendered, so the browser's own jump has already missed.
  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.slice(1))
    requestAnimationFrame(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [hash, key])

  return (
    <Home
      onSearch={handleSearch}
      onOpenAccount={() => navigate('/account')}
      onNavigate={navigateTarget}
      modeRequest={modeRequest}
    />
  )
}

/* ------------------------------------------------------------------
   Standalone pages
   ------------------------------------------------------------------ */

function AccountRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()

  return <Account onExit={() => navigate('/')} onNavigate={navigateTarget} />
}

/**
 * Where the emailed reset link lands. Both halves of the link are read from
 * the query string; the page checks them with the API before asking for a
 * new password.
 */
function ResetPasswordRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()

  return (
    <ResetPassword
      uid={params.get('uid') ?? ''}
      token={params.get('token') ?? ''}
      onNavigate={navigateTarget}
      onOpenAccount={() => navigate('/account')}
      onGoHome={() => navigate('/')}
    />
  )
}

function AboutRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()
  const section = useSection()

  return (
    <About
      section={section}
      onExit={() => navigate('/')}
      onNavigate={navigateTarget}
      onOpenAccount={() => navigate('/account')}
    />
  )
}

function CareersRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()
  const section = useSection()

  return (
    <Careers
      section={section}
      onNavigate={navigateTarget}
      onOpenAccount={() => navigate('/account')}
    />
  )
}

function NewsroomRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()
  const section = useSection()

  return (
    <Newsroom
      section={section}
      onNavigate={navigateTarget}
      onOpenAccount={() => navigate('/account')}
    />
  )
}

function LegalRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()
  const section = useSection()

  return (
    <Legal
      section={section}
      onNavigate={navigateTarget}
      onOpenAccount={() => navigate('/account')}
    />
  )
}

/* ------------------------------------------------------------------
   Booking flows.

   Each reads its search out of the query string and redirects home if the
   parameters it cannot work without are missing — a hand-typed `/train` or
   a half-copied link, rather than anything a search can produce.
   ------------------------------------------------------------------ */

function BusRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const date = params.get('date') ?? ''
  if (!from || !to || !date) return <Navigate to="/" replace />

  return (
    <BusBooking query={{ from, to, date }} onExit={() => navigate('/')} />
  )
}

function TrainRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const date = params.get('date') ?? ''
  if (!from || !to || !date) return <Navigate to="/" replace />

  return (
    <TrainBooking query={{ from, to, date }} onExit={() => navigate('/')} />
  )
}

function PlaneRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const date = params.get('date') ?? ''
  if (!from || !to || !date) return <Navigate to="/" replace />

  return (
    <PlaneBooking
      query={{
        from,
        to,
        date,
        travellers: parseCount(params.get('travellers')),
      }}
      onExit={() => navigate('/')}
    />
  )
}

// Stays and cabs name their inputs differently from the transport modes, so
// their parameters are named after their own fields rather than from/to/date.
function HotelRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const city = params.get('city') ?? ''
  if (!city) return <Navigate to="/" replace />

  return (
    <HotelBooking
      query={{
        city,
        checkIn: params.get('checkIn') || toInputDate(),
        checkOut: params.get('checkOut') || toInputDate(1),
        guests: parseCount(params.get('guests')),
      }}
      onExit={() => navigate('/')}
    />
  )
}

function CabRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const pickup = params.get('pickup') ?? ''
  const drop = params.get('drop') ?? ''
  if (!pickup || !drop) return <Navigate to="/" replace />

  return (
    <CabBooking
      query={{
        pickup,
        drop,
        date: params.get('date') || toInputDate(),
        time: params.get('time') || '09:00',
      }}
      onExit={() => navigate('/')}
    />
  )
}

/* ------------------------------------------------------------------
   Not found
   ------------------------------------------------------------------ */

function NotFoundRoute() {
  const navigate = useNavigate()
  const navigateTarget = useNavigateTarget()
  const { pathname } = useLocation()
  const { requestSignIn } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAuth={requestSignIn}
        onOpenAccount={() => navigate('/account')}
        onNavigate={navigateTarget}
      />

      <main className="flex flex-1 items-center">
        <Container className="py-24 text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-brand-fg uppercase">
            Error 404
          </p>
          <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            This page has left the station
          </h1>
          <p className="mx-auto mt-4 max-w-md text-ink-500">
            Nothing lives at <span className="font-semibold">{pathname}</span>.
            It may have moved, or the link may be incomplete.
          </p>
          <div className="mt-8 flex justify-center">
            <Button size="lg" onClick={() => navigate('/')}>
              Back to search
            </Button>
          </div>
        </Container>
      </main>

      <Footer onNavigate={navigateTarget} />
    </div>
  )
}
