/* oxlint-disable react/only-export-components -- every export here is a
   component; the factory below just hides the shared <svg> boilerplate. */
import type { ReactNode, SVGProps } from 'react'

/**
 * All icons share one 24x24 stroked grid so they stay optically consistent.
 * Size them from the call site with Tailwind (`className="h-5 w-5"`).
 */
function createIcon(paths: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    )
  }
}

/* -- Travel modes -------------------------------------------------- */

export const BusIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 16v1M17 16v1M7.5 13h.01M16.5 13h.01" />
    <circle cx="7" cy="18.5" r="1.5" />
    <circle cx="17" cy="18.5" r="1.5" />
  </>,
)

export const TrainIcon = createIcon(
  <>
    <rect x="4" y="3" width="16" height="13" rx="3" />
    <path d="M4 10h16M8.5 13h.01M15.5 13h.01M7.5 16 5 21M16.5 16 19 21M6 21h12" />
  </>,
)

export const PlaneIcon = createIcon(
  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />,
)

export const HotelIcon = createIcon(
  <>
    <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
    <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 17h20" />
  </>,
)

export const CabIcon = createIcon(
  <>
    <path d="M19 17h2a1 1 0 0 0 1-1v-3c0-.9-.7-1.7-1.5-1.9L16 10l-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9c-.1.4-.2.8-.2 1.2v4c0 .6.4 1 1 1h2" />
    <path d="M9 17h6" />
    <circle cx="6.5" cy="17" r="2" />
    <circle cx="16.5" cy="17" r="2" />
  </>,
)

/* -- Form + navigation --------------------------------------------- */

export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
)

export const SwapIcon = createIcon(
  <path d="M8 3 4 7l4 4M4 7h16m-4 14 4-4-4-4m4 4H4" />,
)

export const MapPinIcon = createIcon(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>,
)

export const CalendarIcon = createIcon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </>,
)

export const ClockIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
)

export const UsersIcon = createIcon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </>,
)

export const UserIcon = createIcon(
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>,
)

export const MenuIcon = createIcon(<path d="M4 7h16M4 12h16M4 17h16" />)
export const CloseIcon = createIcon(<path d="M18 6 6 18M6 6l12 12" />)
export const ChevronDownIcon = createIcon(<path d="m6 9 6 6 6-6" />)
export const ArrowRightIcon = createIcon(<path d="M5 12h14m-6-6 6 6-6 6" />)
export const CheckIcon = createIcon(<path d="m20 6-11 11-5-5" />)

/* -- Marketing ------------------------------------------------------ */

export const ShieldIcon = createIcon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 11.5 2 2 4-4" />
  </>,
)

export const CardIcon = createIcon(
  <>
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <path d="M2 10h20M6 15h4" />
  </>,
)

export const RefundIcon = createIcon(
  <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
)

export const SupportIcon = createIcon(
  <>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <rect x="2" y="14" width="5" height="6" rx="2" />
    <rect x="17" y="14" width="5" height="6" rx="2" />
  </>,
)

/** The chat bubble, on the launcher and in the widget's header. */
export const ChatIcon = createIcon(
  <>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.7-5a8.4 8.4 0 0 1-.7-3.4 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.3Z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
  </>,
)

/** Sends the typed message. A paper plane, pointing where it is going. */
export const SendIcon = createIcon(
  <>
    <path d="M21.4 3.6 2.9 9.9a.6.6 0 0 0 0 1.1l7.4 2.7 2.7 7.4a.6.6 0 0 0 1.1 0Z" />
    <path d="m10.3 13.7 4.6-4.6" />
  </>,
)

export const BoltIcon = createIcon(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />)

export const TicketIcon = createIcon(
  <>
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </>,
)

export const StarIcon = createIcon(
  <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9Z" />,
)

export const PercentIcon = createIcon(
  <>
    <path d="m19 5-14 14" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </>,
)

export const GiftIcon = createIcon(
  <>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13" />
    <path d="M12 8H9.5a2.5 2.5 0 1 1 2.5-2.5V8Zm0 0h2.5A2.5 2.5 0 1 0 12 5.5V8Z" />
  </>,
)

export const GlobeIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </>,
)

/* -- Auth ----------------------------------------------------------- */

export const MailIcon = createIcon(
  <>
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <path d="m3 7.5 8.2 5.4a1.5 1.5 0 0 0 1.6 0L21 7.5" />
  </>,
)

export const LockIcon = createIcon(
  <>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </>,
)

export const PhoneIcon = createIcon(
  <path d="M15.5 21C8.6 21 3 15.4 3 8.5V6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.5 1.1l-1.4.8a12 12 0 0 0 5.5 5.5l.8-1.4a1 1 0 0 1 1.1-.5l3 .7a1 1 0 0 1 .8 1v3a1 1 0 0 1-1 1Z" />,
)

export const EyeIcon = createIcon(
  <>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
)

export const EyeOffIcon = createIcon(
  <>
    <path d="m3 3 18 18" />
    <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.3 17.3 0 0 1-3.2 4.1" />
    <path d="M6.6 6.6A17.2 17.2 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.6-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
)

/* -- Theme ---------------------------------------------------------- */

export const SunIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
)

export const MoonIcon = createIcon(
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
)

/* -- Booking flow ---------------------------------------------------- */

export const WifiIcon = createIcon(
  <>
    <path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 20h.01" />
  </>,
)

export const PlugIcon = createIcon(
  <>
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
    <path d="M12 17v5" />
  </>,
)

export const SnowflakeIcon = createIcon(
  <path d="M12 2v20M4.2 7l15.6 10M19.8 7 4.2 17M12 6l2.5-2.5M12 6 9.5 3.5M12 18l2.5 2.5M12 18l-2.5 2.5M6.2 9.4 2.8 8.5M6.2 14.6l-3.4.9M17.8 9.4l3.4-.9M17.8 14.6l3.4.9" />,
)

export const DropletIcon = createIcon(
  <path d="M12 3s6 5.7 6 10a6 6 0 0 1-12 0c0-4.3 6-10 6-10Z" />,
)

export const ArmchairIcon = createIcon(
  <>
    <path d="M6 12V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5" />
    <path d="M4 12a2 2 0 0 1 4 0v3h8v-3a2 2 0 0 1 4 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z" />
    <path d="M7 19v2M17 19v2" />
  </>,
)

export const SteeringIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v6M3.6 16.5l5.2-3M20.4 16.5l-5.2-3" />
  </>,
)

export const FilterIcon = createIcon(
  <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
)

export const SortIcon = createIcon(
  <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />,
)

export const ChevronLeftIcon = createIcon(<path d="m15 6-6 6 6 6" />)
export const ChevronRightIcon = createIcon(<path d="m9 6 6 6-6 6" />)
export const ArrowLeftIcon = createIcon(<path d="M19 12H5m6-6-6 6 6 6" />)

export const InfoIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5h.01" />
  </>,
)

export const DownloadIcon = createIcon(
  <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
)

export const PrinterIcon = createIcon(
  <>
    <path d="M7 8V3h10v5" />
    <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="7" y="14" width="10" height="7" rx="1.5" />
  </>,
)

export const WalletIcon = createIcon(
  <>
    <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
    <rect x="3" y="8" width="18" height="12" rx="2.5" />
    <path d="M16.5 14h.01" />
  </>,
)

export const BankIcon = createIcon(
  <>
    <path d="M3 10 12 4l9 6" />
    <path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18" />
  </>,
)

export const UpiIcon = createIcon(
  <>
    <path d="m5 12 7-8 7 8-7 8-7-8Z" />
    <path d="m9 12 3.5-4 3.5 4-3.5 4L9 12Z" />
  </>,
)

export const SpinnerIcon = createIcon(
  <path d="M12 3a9 9 0 1 0 9 9" />,
)

/* -- Flights --------------------------------------------------------- */

export const LuggageIcon = createIcon(
  <>
    <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
    <rect x="4" y="6" width="16" height="13" rx="2.5" />
    <path d="M9.5 10v5M14.5 10v5M8 19v2M16 19v2" />
  </>,
)

export const UtensilsIcon = createIcon(
  <>
    <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" />
    <path d="M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9" />
  </>,
)

export const PlusIcon = createIcon(<path d="M12 5v14M5 12h14" />)
export const MinusIcon = createIcon(<path d="M5 12h14" />)

export const ExitIcon = createIcon(
  <>
    <path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    <path d="M16 16l5-4-5-4M21 12H9" />
  </>,
)

/* -- Stays & cabs ---------------------------------------------------- */

export const PoolIcon = createIcon(
  <>
    <path d="M2 17c1.5 0 1.5 1.5 3 1.5S6.5 17 8 17s1.5 1.5 3 1.5S12.5 17 14 17s1.5 1.5 3 1.5S18.5 17 20 17" />
    <path d="M2 21c1.5 0 1.5 1.5 3 1.5S6.5 21 8 21" />
    <path d="M7 15V5a2 2 0 0 1 4 0M13 15V5a2 2 0 0 1 4 0" />
    <path d="M7 9h10" />
  </>,
)

export const ParkingIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M9 17V7h3.5a3 3 0 0 1 0 6H9" />
  </>,
)

export const DumbbellIcon = createIcon(
  <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />,
)

export const RouteIcon = createIcon(
  <>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M15.5 5H10a3.5 3.5 0 0 0 0 7h4a3.5 3.5 0 0 1 0 7H8.5" />
  </>,
)

export const CoffeeIcon = createIcon(
  <>
    <path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" />
    <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M7 3v3M11 3v3" />
  </>,
)

export const MoonStarsIcon = createIcon(
  <>
    <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />
    <path d="M18 3v3M16.5 4.5h3" />
  </>,
)

/* -- Social --------------------------------------------------------- */

export const FacebookIcon = createIcon(
  <path d="M14 9V7.5c0-.8.7-1.5 1.5-1.5H17V3h-2.5A4.5 4.5 0 0 0 10 7.5V9H8v3h2v9h4v-9h2.5l.5-3H14Z" />,
)

export const InstagramIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.5 6.5h.01" />
  </>,
)

export const XIcon = createIcon(
  <path d="M4 3h3.6l4.9 6.6L18 3h2l-6.6 7.7L20.6 21H17l-5.2-7-6 7H3.8l7-8.2L4 3Z" />,
)

export const LinkedInIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M7.5 10.5V17M7.5 7.5v.01M11.5 17v-6M11.5 13.5a2.5 2.5 0 0 1 5 0V17" />
  </>,
)
