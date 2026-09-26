import { apiGet, apiPost } from '@/services/api'
import type {
  AllottedPassenger,
  BoardingStation,
  QuotaId,
  TrainBookingConfirmation,
  TrainClassCode,
  TrainClassOption,
  TrainContact,
  TrainFareBreakdown,
  TrainPassenger,
  TrainSearchQuery,
  TrainTrip,
} from '@/types/train.types'

/**
 * The rail booking API, under `/api/train/`.
 *
 * Everything the backend returns is already in the shape of
 * `@/types/train.types`, so these functions pass responses straight through.
 * What they carry is the mapping on the way *in*: the screens hold whole
 * objects, and the API takes ids and codes.
 */

/* ------------------------------------------------------------------
   Display helpers — pure, no round trip
   ------------------------------------------------------------------ */

export function clockToMinutes(clock: string) {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/**
 * Class names, for a label the results page can show before anything loads.
 *
 * The backend sends the same label on every `TrainClassOption`, from
 * `train_class.label`; this is only the fallback ordering and wording the
 * filter sidebar needs with no results on screen.
 */
export const CLASS_LABELS: Record<TrainClassCode, string> = {
  '1A': 'AC First Class (1A)',
  '2A': 'AC 2 Tier (2A)',
  '3A': 'AC 3 Tier (3A)',
  '3E': 'AC 3 Economy (3E)',
  CC: 'AC Chair Car (CC)',
  SL: 'Sleeper (SL)',
  '2S': 'Second Sitting (2S)',
}

/** Classes that attract GST. `train_class.is_air_conditioned` is the source. */
export const AC_CLASSES: TrainClassCode[] = ['1A', '2A', '3A', '3E', 'CC']

export const QUOTA_LABELS: Record<QuotaId, string> = {
  general: 'General',
  tatkal: 'Tatkal',
  ladies: 'Ladies',
  senior: 'Senior citizen',
}

export const QUOTA_NOTES: Record<QuotaId, string> = {
  general: 'Standard booking, opens 60 days before departure.',
  tatkal: 'Opens one day before departure. Premium fare, no refund on cancellation.',
  ladies: 'Reserved for women travellers and children under 12 with them.',
  senior: 'For travellers aged 60 and above. Lower berths are preferred where free.',
}

export interface Quota {
  id: QuotaId
  label: string
  note: string
  /** Tatkal's premium; zero under every other quota. */
  surchargePercent: number
}

/**
 * The bookable quotas with their live premium.
 *
 * `train_quota.surcharge_percent` is what the fare is actually built from, so
 * this supersedes the constants above wherever a component can wait for it.
 */
export function fetchQuotas(signal?: AbortSignal): Promise<Quota[]> {
  return apiGet<Quota[]>('/train/quotas/', undefined, signal)
}

/* ------------------------------------------------------------------
   Inventory
   ------------------------------------------------------------------ */

/**
 * Trains on a route for a date.
 *
 * `quota` is not part of `TrainSearchQuery`: fares and availability are stored
 * per quota, so one has to be chosen to show a class list at all. It defaults
 * to the same `general` the wizard starts on — pass the traveller's choice to
 * re-price the list when they switch on the review step.
 */
export function searchTrains(
  query: TrainSearchQuery,
  quota: QuotaId = 'general',
  signal?: AbortSignal,
): Promise<TrainTrip[]> {
  return apiGet<TrainTrip[]>(
    '/train/trains/',
    { from: query.from, to: query.to, date: query.date, quota },
    signal,
  )
}

/** One train, for a reload or a link that skips the search. */
export function fetchTrain(
  trainId: string,
  date: string,
  quota: QuotaId = 'general',
  signal?: AbortSignal,
): Promise<TrainTrip> {
  return apiGet<TrainTrip>(
    `/train/trains/${trainId}/`,
    { date, quota },
    signal,
  )
}

/* ------------------------------------------------------------------
   Fare
   ------------------------------------------------------------------ */

const RESERVATION_CHARGE: Record<TrainClassCode, number> = {
  '2S': 15,
  SL: 20,
  CC: 40,
  '3E': 40,
  '3A': 40,
  '2A': 50,
  '1A': 60,
}

const QUOTA_SURCHARGE_RATE: Record<QuotaId, number> = {
  general: 0,
  tatkal: 0.3,
  ladies: 0,
  senior: 0,
}

const INSURANCE_PER_PASSENGER = 0.45
const GST_RATE = 0.05

/**
 * Pure and synchronous, so the summary recalculates as passengers are added
 * without a round trip.
 *
 * These tables mirror `train_class.reservation_charge` and
 * `train_quota.surcharge_percent`. The server recomputes on booking and its
 * answer is what is charged; `quoteTrainFare` below is the authoritative
 * version when it matters.
 */
export function calculateTrainFare({
  classOption,
  quota,
  passengerCount,
  insured,
}: {
  classOption: TrainClassOption | null
  quota: QuotaId
  passengerCount: number
  insured: boolean
}): TrainFareBreakdown {
  if (!classOption || passengerCount === 0) {
    return {
      baseFare: 0,
      quotaSurcharge: 0,
      reservationCharge: 0,
      insurance: 0,
      gst: 0,
      total: 0,
    }
  }

  const baseFare = classOption.fare * passengerCount
  const quotaSurcharge = Math.round(baseFare * QUOTA_SURCHARGE_RATE[quota])
  const reservationCharge =
    RESERVATION_CHARGE[classOption.code] * passengerCount
  const insurance = insured
    ? Math.round(INSURANCE_PER_PASSENGER * passengerCount * 100) / 100
    : 0

  // GST applies to air-conditioned classes only.
  const taxable = baseFare + quotaSurcharge + reservationCharge
  const gst = AC_CLASSES.includes(classOption.code)
    ? Math.round(taxable * GST_RATE)
    : 0

  return {
    baseFare,
    quotaSurcharge,
    reservationCharge,
    insurance,
    gst,
    total: taxable + insurance + gst,
  }
}

export interface TrainFareQuote extends TrainFareBreakdown {
  /** Where the class stands right now — RAC and waitlists move. */
  availability: TrainClassOption['availability']
}

/** The server's own pricing, with the class's live availability. */
export function quoteTrainFare(
  {
    trip,
    classOption,
    quota,
    passengerCount,
    insured,
    date,
  }: {
    trip: TrainTrip
    classOption: TrainClassOption
    quota: QuotaId
    passengerCount: number
    insured: boolean
    date: string
  },
  signal?: AbortSignal,
): Promise<TrainFareQuote> {
  return apiPost<TrainFareQuote>(
    '/train/quote/',
    {
      trainId: trip.id,
      date,
      classCode: classOption.code,
      quota,
      passengerCount,
      insured,
    },
    signal,
  )
}

/* ------------------------------------------------------------------
   Booking
   ------------------------------------------------------------------ */

export interface ConfirmTrainBookingInput {
  trip: TrainTrip
  query: TrainSearchQuery
  classOption: TrainClassOption
  quota: QuotaId
  boardingStation: BoardingStation
  passengers: TrainPassenger[]
  contact: TrainContact
  insured: boolean
}

/**
 * Makes the booking as `pending`, holding what it sells. Nothing is
 * charged here: `payForBooking` in `payment.services` takes the money
 * for the reference this returns and turns it `confirmed`.
 *
 * The passengers come back as `AllottedPassenger[]`: a confirmed class gets a
 * coach and berth, and an RAC or waitlisted one keeps a queue position
 * instead, which is why the berth asked for and the one given can differ.
 *
 * Throws an `ApiError` with `code: 'class_unavailable'` and status 409 when
 * the class closed or ran short of berths while the form was open.
 */
export function confirmTrainBooking(
  input: ConfirmTrainBookingInput,
  signal?: AbortSignal,
): Promise<TrainBookingConfirmation> {
  return apiPost<TrainBookingConfirmation>(
    '/train/bookings/',
    {
      trainId: input.trip.id,
      date: input.query.date,
      classCode: input.classOption.code,
      quota: input.quota,
      boardingStationCode: input.boardingStation.code,
      // The local `id` is a React key and is not stored; each passenger comes
      // back with the row's own id.
      passengers: input.passengers.map((passenger) => ({
        name: passenger.name,
        age: passenger.age,
        gender: passenger.gender,
        berth: passenger.berth,
      })),
      contact: input.contact,
      insured: input.insured,
    },
    signal,
  )
}

/** Looks a ticket up by its ten-digit PNR. */
export function fetchTrainBooking(
  pnr: string,
  signal?: AbortSignal,
): Promise<TrainBookingConfirmation> {
  return apiGet<TrainBookingConfirmation>(
    `/train/bookings/${encodeURIComponent(pnr)}/`,
    undefined,
    signal,
  )
}

/** Re-exported so the ticket screen can type a chart allotment. */
export type { AllottedPassenger }
