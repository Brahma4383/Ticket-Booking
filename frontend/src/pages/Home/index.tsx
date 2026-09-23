import { Footer, Navbar } from '@/components'
import { useAuth } from '@/hooks'
import type { NavTarget } from '@/types/home.types'

import { Hero } from './Hero'
import type { SearchSubmission } from './SearchPanel'
import { Offers } from './Offers'
import { PopularRoutes } from './PopularRoutes'
import { Support } from './Support'
import { WhyUs } from './WhyUs'

export function Home({
  onSearch,
  onOpenAccount,
  onNavigate,
  modeRequest,
}: {
  onSearch: (modeId: string, submission: SearchSubmission) => boolean
  onOpenAccount: () => void
  onNavigate: (target: NavTarget) => void
  /** A tab picked from the Booking menu, with a token so that picking the
      same one twice still counts as a new request. */
  modeRequest?: { id: string; seq: string } | null
}) {
  // The dialog itself lives at the app root; this page only asks for it.
  const { requestSignIn } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAuth={requestSignIn}
        onOpenAccount={onOpenAccount}
        onNavigate={onNavigate}
        activeMenu="Home"
      />

      <main className="flex-1">
        <Hero onSearch={onSearch} modeRequest={modeRequest} />
        <Offers />
        <PopularRoutes />
        <WhyUs />
        <Support onAuth={requestSignIn} />
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}
