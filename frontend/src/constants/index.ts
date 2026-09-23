import {
  BoltIcon,
  BusIcon,
  CabIcon,
  CalendarIcon,
  CardIcon,
  ClockIcon,
  FacebookIcon,
  GiftIcon,
  GlobeIcon,
  HotelIcon,
  InstagramIcon,
  LinkedInIcon,
  MapPinIcon,
  PercentIcon,
  PlaneIcon,
  RefundIcon,
  ShieldIcon,
  SearchIcon,
  SupportIcon,
  TicketIcon,
  TrainIcon,
  UsersIcon,
  XIcon,
} from '@/icons'
import type {
  Feature,
  FooterColumn,
  HiringStep,
  JobOpening,
  LegalSection,
  MediaMention,
  PressRelease,
  Milestone,
  NavMenu,
  NavTarget,
  NavLink,
  Offer,
  Route,
  SocialLink,
  Stat,
  SupportHighlight,
} from '@/types/home.types'
import type { TravelMode } from '@/types/common.types'

export const BRAND = {
  name: 'SuryaBooker',
  tagline: 'Every journey, one booking.',
  supportPhone: '91 90210 24383',
  supportEmail: 'help@suryabooker.in',
} as const

export const NAV_LINKS: NavLink[] = [
  { label: 'Offers', href: '#offers' },
  { label: 'Popular routes', href: '#routes' },
  { label: `Why ${BRAND.name}`, href: '#why-us' },
  { label: 'Support', href: '#support' },
]

/**
 * The header. Four menus, each a dropdown - the flat list of anchors it
 * replaced could not hold the booking modes and the standalone pages as well.
 *
 * Every item carries a target rather than an href because the app has no
 * router: the navbar reports the target and the app decides what to render.
 */
export const NAV_MENUS: NavMenu[] = [
  {
    label: 'Home',
    items: [
      {
        label: 'Search journeys',
        description: 'Back to the top of the search panel.',
        icon: SearchIcon,
        target: { kind: 'section', id: 'top' },
      },
      {
        label: 'Offers',
        description: 'Current discount codes across every mode.',
        icon: PercentIcon,
        target: { kind: 'section', id: 'offers' },
      },
      {
        label: 'Popular routes',
        description: 'The corridors travellers book most.',
        icon: MapPinIcon,
        target: { kind: 'section', id: 'routes' },
      },
      {
        label: `Why ${BRAND.name}`,
        description: 'Refunds, live tracking and the price promise.',
        icon: BoltIcon,
        target: { kind: 'section', id: 'why-us' },
      },
      {
        label: 'Support',
        description: 'Reach a human, any hour of the day.',
        icon: SupportIcon,
        target: { kind: 'section', id: 'support' },
      },
    ],
  },
  {
    label: 'Booking',
    items: [
      {
        label: 'Bus tickets',
        description: 'Sleeper, AC and Volvo across 5,000+ routes.',
        icon: BusIcon,
        target: { kind: 'mode', id: 'bus' },
      },
      {
        label: 'Train tickets',
        description: 'Reserved classes with live seat availability.',
        icon: TrainIcon,
        target: { kind: 'mode', id: 'train' },
      },
      {
        label: 'Flights',
        description: 'Domestic fares from every partner airline.',
        icon: PlaneIcon,
        target: { kind: 'mode', id: 'plane' },
      },
      {
        label: 'Hotels',
        description: 'Stays and homestays with free cancellation.',
        icon: HotelIcon,
        target: { kind: 'mode', id: 'hotel' },
      },
      {
        label: 'Cabs',
        description: 'Airport transfers and outstation trips.',
        icon: CabIcon,
        target: { kind: 'mode', id: 'cab' },
      },
      {
        label: 'My bookings',
        description: 'Tickets, invoices and refund status.',
        icon: TicketIcon,
        target: { kind: 'account' },
      },
    ],
  },
  {
    label: 'Company',
    items: [
      {
        label: 'About us',
        description: `What ${BRAND.name} is and who runs it.`,
        icon: GlobeIcon,
        target: { kind: 'page', page: 'about' },
      },
      {
        label: 'Our story',
        description: 'The missed bus that started the company.',
        icon: BoltIcon,
        target: { kind: 'page', page: 'about', section: 'story' },
      },
      {
        label: 'Careers',
        description: 'Open roles across engineering, design and support.',
        icon: UsersIcon,
        target: { kind: 'page', page: 'careers' },
      },
      {
        label: 'Newsroom',
        description: 'Announcements, press releases and coverage.',
        icon: BoltIcon,
        target: { kind: 'page', page: 'newsroom' },
      },
      {
        label: 'Milestones',
        description: 'Six years, one route at a time.',
        icon: ClockIcon,
        target: { kind: 'page', page: 'about', section: 'milestones' },
      },
      {
        label: 'Contact us',
        description: 'Phone, email and the support desk.',
        icon: SupportIcon,
        target: { kind: 'page', page: 'about', section: 'contact' },
      },
    ],
  },
  {
    label: 'Legal',
    items: [
      {
        label: 'Terms of use',
        description: 'The agreement behind every booking.',
        icon: TicketIcon,
        target: { kind: 'page', page: 'legal', section: 'terms' },
      },
      {
        label: 'Privacy policy',
        description: 'What we collect, and what we never sell.',
        icon: ShieldIcon,
        target: { kind: 'page', page: 'legal', section: 'privacy' },
      },
      {
        label: 'Cancellation and refunds',
        description: 'Charges, windows and settlement times.',
        icon: RefundIcon,
        target: { kind: 'page', page: 'legal', section: 'refunds' },
      },
      {
        label: 'Cookie preferences',
        description: 'The cookies we set and why.',
        icon: CardIcon,
        target: { kind: 'page', page: 'legal', section: 'cookies' },
      },
    ],
  },
]

/** Suggestions behind every "place" input. */
export const CITIES = [
  'Mumbai',
  'Navi Mumbai',
  'Pune',
  'Nashik',
  'Nagpur',
  'Delhi',
  'Gurugram',
  'Jaipur',
  'Ahmedabad',
  'Surat',
  'Indore',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kochi',
  'Goa',
  'Kolkata',
  'Lucknow',
  'Chandigarh',
  'Dehradun',
]

const TRAVELLER_OPTIONS = [
  '1 Traveller',
  '2 Travellers',
  '3 Travellers',
  '4 Travellers',
  '5+ Travellers',
]

/**
 * The search panel is entirely driven by this list: adding a mode, or a field
 * to a mode, is all it takes for the UI to pick it up.
 */
export const TRAVEL_MODES: TravelMode[] = [
  {
    id: 'bus',
    label: 'Bus',
    icon: BusIcon,
    tagline: 'Sleeper, AC and Volvo buses across 5,000+ routes.',
    cta: 'Search buses',
    swap: ['from', 'to'],
    fields: [
      {
        name: 'from',
        label: 'From',
        type: 'place',
        placeholder: 'Leaving from',
        span: 4,
        icon: MapPinIcon,
      },
      {
        name: 'to',
        label: 'To',
        type: 'place',
        placeholder: 'Going to',
        span: 4,
        icon: MapPinIcon,
      },
      {
        name: 'date',
        label: 'Date of journey',
        type: 'date',
        span: 4,
        icon: CalendarIcon,
      },
    ],
  },
  {
    id: 'train',
    label: 'Train',
    icon: TrainIcon,
    tagline: 'Live seat availability across every travel class.',
    cta: 'Search trains',
    swap: ['from', 'to'],
    fields: [
      {
        name: 'from',
        label: 'From station',
        type: 'place',
        placeholder: 'Origin station',
        span: 3,
        icon: MapPinIcon,
      },
      {
        name: 'to',
        label: 'To station',
        type: 'place',
        placeholder: 'Destination station',
        span: 3,
        icon: MapPinIcon,
      },
      {
        name: 'date',
        label: 'Date of journey',
        type: 'date',
        span: 3,
        icon: CalendarIcon,
      },
      {
        name: 'travelClass',
        label: 'Class',
        type: 'select',
        span: 3,
        icon: TicketIcon,
        options: [
          'All classes',
          'Sleeper (SL)',
          'AC 3 Tier (3A)',
          'AC 2 Tier (2A)',
          'AC First (1A)',
          'Chair Car (CC)',
        ],
      },
    ],
  },
  {
    id: 'plane',
    label: 'Flight',
    icon: PlaneIcon,
    tagline: 'Compare fares across 40+ airlines instantly.',
    cta: 'Search flights',
    swap: ['from', 'to'],
    fields: [
      {
        name: 'from',
        label: 'From',
        type: 'place',
        placeholder: 'City or airport',
        span: 3,
        icon: MapPinIcon,
      },
      {
        name: 'to',
        label: 'To',
        type: 'place',
        placeholder: 'City or airport',
        span: 3,
        icon: MapPinIcon,
      },
      {
        name: 'date',
        label: 'Departure',
        type: 'date',
        span: 3,
        icon: CalendarIcon,
      },
      {
        name: 'travellers',
        label: 'Travellers',
        type: 'select',
        span: 3,
        icon: UsersIcon,
        options: TRAVELLER_OPTIONS,
      },
    ],
  },
  {
    id: 'hotel',
    label: 'Hotel',
    icon: HotelIcon,
    tagline: 'Free cancellation on most stays.',
    cta: 'Search hotels',
    fields: [
      {
        name: 'city',
        label: 'City or area',
        type: 'place',
        placeholder: 'Where are you staying?',
        span: 4,
        icon: MapPinIcon,
      },
      {
        name: 'checkIn',
        label: 'Check-in',
        type: 'date',
        span: 3,
        icon: CalendarIcon,
      },
      {
        name: 'checkOut',
        label: 'Check-out',
        type: 'date',
        span: 3,
        icon: CalendarIcon,
      },
      {
        name: 'guests',
        label: 'Guests',
        type: 'select',
        span: 2,
        icon: UsersIcon,
        options: ['1 Guest', '2 Guests', '3 Guests', '4+ Guests'],
      },
    ],
  },
  {
    id: 'cab',
    label: 'Cab',
    icon: CabIcon,
    tagline: 'Airport transfers and outstation drops.',
    cta: 'Search cabs',
    swap: ['pickup', 'drop'],
    fields: [
      {
        name: 'pickup',
        label: 'Pickup',
        type: 'place',
        placeholder: 'Pickup point',
        span: 3,
        icon: MapPinIcon,
      },
      {
        name: 'drop',
        label: 'Drop',
        type: 'place',
        placeholder: 'Drop point',
        span: 3,
        icon: MapPinIcon,
      },
      {
        name: 'date',
        label: 'Pickup date',
        type: 'date',
        span: 3,
        icon: CalendarIcon,
      },
      {
        name: 'time',
        label: 'Pickup time',
        type: 'time',
        span: 3,
        icon: ClockIcon,
      },
    ],
  },
]

export const STATS: Stat[] = [
  { value: '2.4 Cr+', label: 'Tickets booked' },
  { value: '5,000+', label: 'Routes covered' },
  { value: '4.6 / 5', label: 'Traveller rating' },
  { value: '24 x 7', label: 'Human support' },
]

/** The about page's promise cards. Deliberately narrower than FEATURES:
    these are commitments, not product features. */
export const ABOUT_VALUES: Feature[] = [
  {
    title: 'One account, every mode',
    description:
      'Buses, trains, flights, hotels and cabs sit behind a single login, a single wallet and a single support queue.',
    icon: GlobeIcon,
  },
  {
    title: 'The fare you see is the fare you pay',
    description:
      'Convenience fees and taxes are in the first price we show you. Nothing appears at checkout that was not there at search.',
    icon: ShieldIcon,
  },
  {
    title: 'Refunds measured in minutes',
    description:
      'Cancellations settle back to the original payment method the same day, and the status is visible the whole way.',
    icon: RefundIcon,
  },
  {
    title: 'People answer the phone',
    description:
      'Support is staffed round the clock in eight languages, and every booking can reach a human in under two minutes.',
    icon: SupportIcon,
  },
]

/** Company timeline, oldest first. */
export const ABOUT_MILESTONES: Milestone[] = [
  {
    year: '2018',
    title: 'Started with one bus route',
    description:
      'Three of us built a booking page for the Mumbai to Pune corridor after missing a bus we had already paid for.',
  },
  {
    year: '2020',
    title: 'Trains and instant refunds',
    description:
      'Lockdown cancellations taught us that refund speed matters more than fare discounts. We rebuilt payments around it.',
  },
  {
    year: '2022',
    title: 'Flights, hotels and cabs',
    description:
      'The search panel became one surface for five modes, so a whole trip could be planned without leaving the page.',
  },
  {
    year: '2024',
    title: '2.4 crore tickets',
    description:
      'Now serving travellers across 5,000+ routes, with a 4.6 average rating from 1.2 lakh reviews.',
  },
]

/** Press releases, newest first. */
export const PRESS_RELEASES: PressRelease[] = [
  {
    id: 'pr-2026-09',
    date: '2026-09-04',
    category: 'Product',
    title: 'One search panel now covers cabs to the airport gate',
    summary:
      'Airport transfers booked alongside a flight now track the flight itself, and a delayed arrival moves the pickup without a call to support.',
  },
  {
    id: 'pr-2026-07',
    date: '2026-07-22',
    category: 'Company',
    title: `${BRAND.name} crosses 2.4 crore tickets booked`,
    summary:
      'Six years after the first Mumbai to Pune booking, the platform now covers more than 5,000 routes across five modes of travel.',
  },
  {
    id: 'pr-2026-05',
    date: '2026-05-16',
    category: 'Product',
    title: 'Refunds now settle to the wallet instantly on every mode',
    summary:
      'Cancellations on trains and hotels join buses and flights in settling the same day, with the status visible from the booking itself.',
  },
  {
    id: 'pr-2026-03',
    date: '2026-03-08',
    category: 'Partnerships',
    title: 'Eleven state transport corporations join the platform',
    summary:
      'Public bus services across Maharashtra, Gujarat and Karnataka are now bookable with live seat availability rather than on arrival.',
  },
  {
    id: 'pr-2025-12',
    date: '2025-12-02',
    category: 'Company',
    title: 'Night support desk opens in Indore',
    summary:
      'A forty-person desk now staffs the 10pm to 7am window, with the authority to rebook and refund without escalating a case.',
  },
]

/** Coverage elsewhere. Outlet names are placeholders, as are the headlines. */
export const MEDIA_MENTIONS: MediaMention[] = [
  {
    outlet: 'The Daily Ledger',
    headline: 'The booking app betting on refunds, not discounts',
    date: '2026-08-19',
  },
  {
    outlet: 'Transit Weekly',
    headline: 'How one search box swallowed five travel categories',
    date: '2026-06-30',
  },
  {
    outlet: 'Founders Review',
    headline: 'A missed bus, and the company it turned into',
    date: '2026-04-11',
  },
  {
    outlet: 'Commuter Magazine',
    headline: 'State buses go digital, one corporation at a time',
    date: '2026-03-15',
  },
]

/** What the careers page offers, over and above the role itself. */
export const CAREER_PERKS: Feature[] = [
  {
    title: 'Travel allowance, used',
    description:
      'Every employee gets ₹60,000 a year of travel on the platform, and a day of leave for each trip they write up for the team.',
    icon: TicketIcon,
  },
  {
    title: 'Four days in, one anywhere',
    description:
      'Offices in Mumbai, Bengaluru and Indore, with one day a week from wherever you are, and two fully remote weeks a quarter.',
    icon: GlobeIcon,
  },
  {
    title: 'Health cover that includes parents',
    description:
      '₹10 lakh family floater from day one, parents included, with no waiting period on pre-existing conditions.',
    icon: ShieldIcon,
  },
  {
    title: 'Support shifts for everyone',
    description:
      'Engineers, designers and finance all take one support shift a month. It is the fastest way to learn what actually breaks.',
    icon: SupportIcon,
  },
]

/** Open roles. `id` doubles as the reference in an application email. */
export const JOB_OPENINGS: JobOpening[] = [
  {
    id: 'ENG-114',
    title: 'Senior Frontend Engineer',
    team: 'Engineering',
    location: 'Mumbai',
    type: 'Full-time',
    description:
      'Own the booking funnel end to end: search, seat selection and checkout, across five travel modes and two themes.',
  },
  {
    id: 'ENG-121',
    title: 'Backend Engineer, Payments',
    team: 'Engineering',
    location: 'Bengaluru',
    type: 'Full-time',
    description:
      'Work on settlement, refunds and reconciliation with acquiring banks. Our refund promise is measured in minutes, and this team keeps it.',
  },
  {
    id: 'ENG-126',
    title: 'Site Reliability Engineer',
    team: 'Engineering',
    location: 'Bengaluru',
    type: 'Full-time',
    description:
      'Keep the platform standing through festival-week traffic, when bookings run twelve times an ordinary Tuesday.',
  },
  {
    id: 'DES-032',
    title: 'Product Designer',
    team: 'Design',
    location: 'Mumbai',
    type: 'Full-time',
    description:
      'Design for travellers on patchy connections and small screens, in a product where a wrong tap costs real money.',
  },
  {
    id: 'OPS-058',
    title: 'Operator Partnerships Manager',
    team: 'Operations',
    location: 'Indore',
    type: 'Full-time',
    description:
      'Bring bus and hotel operators onto the platform, and hold them to the cancellation and seat-accuracy standards we publish.',
  },
  {
    id: 'SUP-077',
    title: 'Support Specialist, Night Desk',
    team: 'Support',
    location: 'Indore',
    type: 'Full-time',
    description:
      'Resolve stranded-traveller cases between 10pm and 7am, with the authority to rebook, refund and compensate without escalating.',
  },
  {
    id: 'DAT-019',
    title: 'Data Analyst, Pricing',
    team: 'Data',
    location: 'Bengaluru',
    type: 'Full-time',
    description:
      'Find where our fares drift from the market and why, and make the price promise cheap enough to keep offering.',
  },
  {
    id: 'ENG-130',
    title: 'Engineering Intern',
    team: 'Engineering',
    location: 'Mumbai',
    type: '6-month internship',
    description:
      'Ship to production in your first fortnight, with a mentor and a defined project rather than a rotation.',
  },
]

/** The hiring process, in order. */
export const HIRING_STEPS: HiringStep[] = [
  {
    title: 'Application',
    description:
      'A CV and a few lines on why this role. No cover letter, and no form that retypes your CV back at you.',
  },
  {
    title: 'Intro call',
    description:
      'Thirty minutes with the hiring manager on what the team does and what you want next. Compensation is discussed here, not at the end.',
  },
  {
    title: 'Craft interview',
    description:
      'A problem from our actual backlog, paired with someone on the team. Take-homes are optional and always paid.',
  },
  {
    title: 'Team and decision',
    description:
      'Two conversations with people you would work beside, then a decision within three working days either way, with feedback.',
  },
]

/**
 * The legal page. Plain-language summaries first, then the clauses - the
 * summary is what a traveller actually reads before booking.
 */
export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: 'terms',
    title: 'Terms of use',
    summary:
      'We sell travel on behalf of operators, airlines and hotels. Their conditions of carriage apply to the journey; ours apply to the booking.',
    paragraphs: [
      `By creating an account or completing a booking you agree to these terms. ${BRAND.name} acts as an agent for the operator carrying you, and the ticket is a contract between you and that operator.`,
      'You are responsible for the accuracy of the names, ages and identification numbers entered at booking. Operators may refuse travel where these do not match the document presented at boarding.',
      'Fares, seat availability and taxes are held for the duration of a checkout session only. Where a fare changes before payment completes, the booking is not made and no amount is captured.',
      'We may suspend an account used for resale, automated scraping, payment fraud or abuse of our support staff. Where we do, confirmed tickets are honoured and the balance of any wallet is returned.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy policy',
    summary:
      'We collect what a booking needs and what the law requires. We do not sell personal data, and we do not share contact details with operators beyond the journey at hand.',
    paragraphs: [
      'We store your name, contact details, travel history and the identification required by the operator or by Indian transport rules. Payment instruments are held by our PCI-DSS compliant payment partners, never on our own servers.',
      'Operator partners receive only the passenger details needed to carry you: name, age, gender and seat. Support transcripts are retained for two years so a disputed booking can be reconstructed.',
      'You can export or delete your data from the account page at any time. Deletion removes the profile and travel history; invoices are retained for the period the tax authorities require.',
      `Questions about data use go to ${BRAND.supportEmail}, and our grievance officer responds within fifteen days as required by the Information Technology Rules.`,
    ],
  },
  {
    id: 'refunds',
    title: 'Cancellation and refunds',
    summary:
      'Cancellation charges are set by the operator and shown before you confirm. Once a cancellation is accepted, the money leaves us the same day.',
    paragraphs: [
      'The cancellation charge applicable to your ticket is displayed on the review step and on the ticket itself. It varies by operator, fare type and how close to departure you cancel.',
      'Refunds return to the original payment method. Cards and netbanking settle in one to five working days depending on your bank; refunds to the wallet are instant.',
      'Where an operator cancels a service, the full fare including our convenience fee is refunded without a request from you, and we notify you on the number the booking was made from.',
      'A refund that has not reached you within seven working days can be escalated from the booking on the account page, and we take it up with the bank on your behalf.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookie preferences',
    summary:
      'Essential cookies keep you signed in and hold your search. Everything else is optional and can be turned off without breaking a booking.',
    paragraphs: [
      'Essential cookies store your session, your theme choice and the contents of an in-progress search. These cannot be disabled because a booking cannot be completed without them.',
      'Analytics cookies tell us which steps travellers abandon. They are aggregated and hold no name, phone number or email address.',
      'Marketing cookies are used to measure whether an advertisement led to a booking. We set none of these until you accept them.',
      'Your choice is stored for twelve months and can be changed at any time from this page or from your browser settings.',
    ],
  },
]

export const OFFERS: Offer[] = [
  {
    code: 'FIRSTRIDE',
    title: 'Flat 15% off your first bus ticket',
    description: 'Up to ₹250 back on any sleeper or AC bus booked this month.',
    accent: 'from-brand-600 to-brand-800',
    icon: PercentIcon,
  },
  {
    code: 'FLYLOW',
    title: '₹1,200 off domestic flights',
    description: 'On round trips above ₹8,000. Valid on all partner airlines.',
    accent: 'from-accent-600 to-brand-700',
    icon: GiftIcon,
  },
  {
    code: 'STAY700',
    title: '₹700 off hotels and homestays',
    description: 'Minimum two nights. Free-cancellation stays included.',
    accent: 'from-brand-700 to-brand-900',
    icon: TicketIcon,
  },
]

export const POPULAR_ROUTES: Route[] = [
  { from: 'Mumbai', to: 'Pune', mode: 'Bus', duration: '3h 30m', price: 449 },
  { from: 'Delhi', to: 'Jaipur', mode: 'Train', duration: '4h 45m', price: 610 },
  {
    from: 'Bengaluru',
    to: 'Goa',
    mode: 'Flight',
    duration: '1h 15m',
    price: 2899,
  },
  {
    from: 'Navi Mumbai',
    to: 'Nashik',
    mode: 'Cab',
    duration: '4h 10m',
    price: 3200,
  },
  {
    from: 'Hyderabad',
    to: 'Chennai',
    mode: 'Bus',
    duration: '11h 20m',
    price: 1099,
  },
  {
    from: 'Ahmedabad',
    to: 'Surat',
    mode: 'Train',
    duration: '3h 05m',
    price: 285,
  },
]

export const FEATURES: Feature[] = [
  {
    title: 'Instant refunds',
    description:
      'Cancel and the money is back in your account within minutes, not weeks.',
    icon: RefundIcon,
  },
  {
    title: 'Live tracking',
    description:
      'Follow your bus, train or flight in real time and share it with family.',
    icon: BoltIcon,
  },
  {
    title: 'Secure payments',
    description:
      'PCI-DSS compliant checkout with UPI, cards, netbanking and wallets.',
    icon: CardIcon,
  },
  {
    title: 'Price promise',
    description:
      'Spot a lower fare elsewhere and we refund the difference, no questions.',
    icon: ShieldIcon,
  },
]

export const SUPPORT_HIGHLIGHTS: SupportHighlight[] = [
  {
    title: 'Talk to a real person',
    description: 'Call ' + BRAND.supportPhone + ' at any hour, on any day.',
    icon: SupportIcon,
  },
  {
    // The one card that does something rather than describing something:
    // it opens the assistant, which answers in each of these languages.
    title: 'Help in 12 languages',
    description:
      'Chat support in Hindi, Marathi, Tamil, Telugu, Bengali and more.',
    icon: GlobeIcon,
    opensChat: true,
  },
]

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Book',
    links: ['Bus tickets', 'Train tickets', 'Flight tickets', 'Hotels', 'Cabs'],
  },
  {
    title: 'Company',
    links: ['About us', 'Careers', 'Newsroom', 'Partner with us'],
  },
  {
    title: 'Support',
    links: [
      'Help centre',
      'Cancellation policy',
      'Refund status',
      'Report an issue',
    ],
  },
  {
    title: 'Legal',
    links: ['Terms of use', 'Privacy policy', 'Cookie preferences'],
  },
]

/**
 * Footer links that lead somewhere, keyed by their label in FOOTER_COLUMNS.
 *
 * The columns stay plain strings: a label with no entry here is still
 * rendered, as a placeholder anchor, which is what the unbuilt pages need.
 */
export const FOOTER_TARGETS: Record<string, NavTarget> = {
  'Bus tickets': { kind: 'mode', id: 'bus' },
  'Train tickets': { kind: 'mode', id: 'train' },
  'Flight tickets': { kind: 'mode', id: 'plane' },
  Hotels: { kind: 'mode', id: 'hotel' },
  Cabs: { kind: 'mode', id: 'cab' },
  'About us': { kind: 'page', page: 'about' },
  Careers: { kind: 'page', page: 'careers' },
  Newsroom: { kind: 'page', page: 'newsroom' },
  'Help centre': { kind: 'section', id: 'support' },
  'Cancellation policy': { kind: 'page', page: 'legal', section: 'refunds' },
  'Refund status': { kind: 'account' },
  'Report an issue': { kind: 'section', id: 'support' },
  'Terms of use': { kind: 'page', page: 'legal', section: 'terms' },
  'Privacy policy': { kind: 'page', page: 'legal', section: 'privacy' },
  'Cookie preferences': { kind: 'page', page: 'legal', section: 'cookies' },
}

export const SOCIAL_LINKS: SocialLink[] = [
  { label: 'Facebook', icon: FacebookIcon },
  { label: 'Instagram', icon: InstagramIcon },
  { label: 'X', icon: XIcon },
  { label: 'LinkedIn', icon: LinkedInIcon },
]

export type { MasterStation } from './trainStations'
export { TRAIN_STATIONS } from './trainStations'
