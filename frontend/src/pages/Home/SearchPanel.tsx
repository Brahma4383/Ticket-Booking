import { useEffect, useRef, useState } from 'react'

import {
  AutocompleteField,
  Button,
  DateField,
  SelectField,
  TextField,
  TimeField,
} from '@/components'
import type { AutocompleteOption } from '@/components'
import { CITIES, TRAIN_STATIONS, TRAVEL_MODES } from '@/constants'
import { useFormValidation } from '@/hooks'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchIcon, SwapIcon } from '@/icons'
import type { SearchField, TravelMode } from '@/types/common.types'
import { cn, toInputDate } from '@/utils'
import type { FieldError, FormErrors } from '@/utils/validation'
import { collectErrors, date, place, time } from '@/utils/validation'

/** Cities carry no secondary line; stations show their code beside the name. */
const CITY_OPTIONS: AutocompleteOption[] = CITIES.map((city) => ({ value: city }))

// Trains are searched station to station, so their place fields suggest the
// railway station index rather than the city list every other mode uses.
const STATION_OPTIONS: AutocompleteOption[] = TRAIN_STATIONS.map((station) => ({
  value: station.name,
  meta: station.code,
}))

/** Static strings so Tailwind can see every span class it needs to generate. */
const SPAN_CLASS: Record<number, string> = {
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
}

type ModeValues = Record<string, Record<string, string>>

function createInitialValues(): ModeValues {
  const state: ModeValues = {}

  for (const mode of TRAVEL_MODES) {
    const values: Record<string, string> = {}

    for (const field of mode.fields) {
      if (field.type === 'date') {
        // Check-out defaults to the night after check-in.
        values[field.name] = toInputDate(field.name === 'checkOut' ? 1 : 0)
      } else if (field.type === 'select') {
        values[field.name] = field.options?.[0] ?? ''
      } else if (field.type === 'time') {
        values[field.name] = '09:00'
      } else {
        values[field.name] = ''
      }
    }

    state[mode.id] = values
  }

  return state
}

const samePlace = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== ''

/**
 * What a search needs before it is worth sending.
 *
 * Keyed on the fields the mode has rather than on the mode, so a new field in
 * `@/constants` with one of these names is checked without touching this.
 * A cab with the same pickup and drop is deliberately allowed - that is what
 * a local trip is.
 */
function validateSearch(values: Record<string, string>): FormErrors {
  const today = toInputDate()
  const rules: Array<[string, FieldError]> = []

  if ('from' in values) {
    rules.push(['from', place(values.from, 'Origin')])
    rules.push([
      'to',
      place(values.to, 'Destination') ??
        (samePlace(values.from, values.to)
          ? 'Destination must be different from the origin.'
          : null),
    ])
  }
  if ('date' in values) {
    rules.push(['date', date(values.date, { label: 'Date', notBefore: today })])
  }
  if ('city' in values) rules.push(['city', place(values.city, 'City')])
  if ('checkIn' in values) {
    rules.push([
      'checkIn',
      date(values.checkIn, { label: 'Check-in', notBefore: today }),
    ])
  }
  if ('checkOut' in values) {
    rules.push([
      'checkOut',
      date(values.checkOut, {
        label: 'Check-out',
        notBefore: today,
        after: values.checkIn,
        afterLabel: 'check-in',
      }),
    ])
  }
  if ('pickup' in values) rules.push(['pickup', place(values.pickup, 'Pickup')])
  if ('drop' in values) rules.push(['drop', place(values.drop, 'Drop')])
  if ('time' in values) rules.push(['time', time(values.time, 'Pickup time')])

  return collectErrors(rules)
}

export interface SearchSubmission {
  from: string
  to: string
  date: string
  /**
   * Every field of the submitted mode, so a flow can read the inputs only it
   * cares about — flights pull the traveller count from here, for instance.
   */
  values: Record<string, string>
}

export function SearchPanel({
  onSearch,
  modeRequest,
}: {
  /**
   * A tab picked from the header's Booking menu. Carries a token — the
   * history entry it arrived on — because the panel reacts to the request
   * changing, and picking the same mode a second time has to count.
   */
  modeRequest?: { id: string; seq: string } | null
  /**
   * Called on submit. Return true if a booking flow took over; when it returns
   * false the panel falls back to showing the entered values inline.
   */
  onSearch?: (modeId: string, submission: SearchSubmission) => boolean
}) {
  const [activeId, setActiveId] = useState(TRAVEL_MODES[0].id)
  const [values, setValues] = useState<ModeValues>(createInitialValues)
  const [summary, setSummary] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  // A mode chosen in the header selects that tab and brings the panel into
  // view, since the header link can be clicked from far down the page.
  const requestedMode = modeRequest?.id
  useEffect(() => {
    if (!requestedMode) return
    if (!TRAVEL_MODES.some((item) => item.id === requestedMode)) return

    setActiveId(requestedMode)
    panel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // `seq` is deliberately the only dependency: it is the trigger, and the
    // mode id alone would not fire twice for the same mode.
  }, [modeRequest?.seq])

  const mode = TRAVEL_MODES.find((item) => item.id === activeId) as TravelMode
  const current = values[mode.id]
  const today = toInputDate()

  const { errors, submit, reset } = useFormValidation(current, validateSearch)

  const setValue = (name: string, value: string) => {
    setSummary(null)
    setValues((previous) => ({
      ...previous,
      [mode.id]: { ...previous[mode.id], [name]: value },
    }))
  }

  const handleSwap = () => {
    if (!mode.swap) return
    const [a, b] = mode.swap
    setSummary(null)
    setValues((previous) => ({
      ...previous,
      [mode.id]: {
        ...previous[mode.id],
        [a]: previous[mode.id][b],
        [b]: previous[mode.id][a],
      },
    }))
  }

  const handleSubmit = submit(() => {
    const handled = onSearch?.(mode.id, {
      from: current.from,
      to: current.to,
      date: current.date,
      values: current,
    })
    if (handled) return

    // Modes without a booking flow stop here.
    setSummary(
      mode.fields
        .filter((field) => current[field.name])
        .map((field) => `${field.label}: ${current[field.name]}`)
        .join('   ·   '),
    )
  })

  const renderField = (field: SearchField, applySpan: boolean) => {
    const wrapperClassName = applySpan
      ? SPAN_CLASS[field.span ?? 3]
      : undefined

    if (field.type === 'select') {
      return (
        <SelectField
          key={field.name}
          label={field.label}
          icon={field.icon}
          options={field.options ?? []}
          value={current[field.name]}
          onChange={(next) => setValue(field.name, next)}
          wrapperClassName={wrapperClassName}
          error={errors[field.name]}
        />
      )
    }

    if (field.type === 'place') {
      const isTrain = mode.id === 'train'
      return (
        <AutocompleteField
          key={field.name}
          label={field.label}
          icon={field.icon}
          placeholder={field.placeholder}
          options={isTrain ? STATION_OPTIONS : CITY_OPTIONS}
          emptyMessage={isTrain ? 'No station found' : 'No city found'}
          value={current[field.name]}
          onChange={(next) => setValue(field.name, next)}
          wrapperClassName={wrapperClassName}
          error={errors[field.name]}
        />
      )
    }

    if (field.type === 'time') {
      return (
        <TimeField
          key={field.name}
          label={field.label}
          icon={field.icon}
          placeholder={field.placeholder}
          value={current[field.name]}
          onChange={(next) => setValue(field.name, next)}
          wrapperClassName={wrapperClassName}
          error={errors[field.name]}
        />
      )
    }

    if (field.type === 'date') {
      return (
        <DateField
          key={field.name}
          label={field.label}
          icon={field.icon}
          placeholder={field.placeholder}
          value={current[field.name]}
          min={today}
          onChange={(next) => setValue(field.name, next)}
          wrapperClassName={wrapperClassName}
          error={errors[field.name]}
        />
      )
    }

    return (
      <TextField
        key={field.name}
        label={field.label}
        icon={field.icon}
        type="text"
        placeholder={field.placeholder}
        value={current[field.name]}
        autoComplete="off"
        onChange={(event) => setValue(field.name, event.target.value)}
        wrapperClassName={wrapperClassName}
        error={errors[field.name]}
      />
    )
  }

  // Swappable modes render their two location fields inside a shared cell so
  // the swap button can sit exactly on the seam between them.
  const swapNames: string[] = mode.swap ?? []
  const pairFields = mode.fields.filter((field) =>
    swapNames.includes(field.name),
  )
  const otherFields = mode.fields.filter(
    (field) => !swapNames.includes(field.name),
  )
  const pairSpan = pairFields.reduce((total, field) => total + (field.span ?? 3), 0)

  return (
    <div
      ref={panel}
      className="relative scroll-mt-28 rounded-[1.75rem] bg-surface p-4 shadow-lift ring-1 ring-hairline sm:p-6 lg:mb-10"
    >
      {/* Mode tabs, on shadcn's Tabs: the arrow keys move between them and
          the roles and ids are wired for free. The panel is the form below,
          which is why it is named by hand rather than rendered as a
          TabsContent - every mode shares the one form. */}
      <Tabs
        value={mode.id}
        onValueChange={(next) => {
          setActiveId(next)
          setSummary(null)
          reset()
        }}
        className="gap-0"
      >
        <TabsList
          aria-label="What would you like to book?"
          className="no-scrollbar -mx-1 flex h-auto w-auto justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 px-1 pb-1 text-ink-500"
        >
          {TRAVEL_MODES.map((item) => {
            const Icon = item.icon

            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                id={`mode-tab-${item.id}`}
                aria-controls="mode-panel"
                className={cn(
                  'h-auto flex-none shrink-0 cursor-pointer gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold text-ink-500 transition-colors after:hidden',
                  'hover:bg-surface-muted hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                  'data-active:bg-brand-600 data-active:text-white data-active:shadow-sm data-active:hover:bg-brand-600 dark:data-active:border-0 dark:data-active:bg-brand-600 dark:data-active:text-white',
                )}
              >
                <Icon className="size-[18px]" />
                {item.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <p className="mt-4 mb-4 text-sm text-ink-500">{mode.tagline}</p>

      <form
        id="mode-panel"
        role="tabpanel"
        aria-labelledby={`mode-tab-${mode.id}`}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {pairFields.length === 2 ? (
            <div
              className={cn(
                'relative sm:col-span-2',
                SPAN_CLASS[pairSpan] ?? 'lg:col-span-6',
              )}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pairFields.map((field) => renderField(field, false))}
              </div>
              <button
                type="button"
                onClick={handleSwap}
                aria-label={`Swap ${pairFields[0].label} and ${pairFields[1].label}`}
                className="absolute top-1/2 left-1/2 z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-surface text-brand-fg shadow-card ring-1 ring-hairline transition-colors hover:bg-brand-surface"
              >
                <SwapIcon className="h-[18px] w-[18px] rotate-90 sm:rotate-0" />
              </button>
            </div>
          ) : null}

          {otherFields.map((field) => renderField(field, true))}
        </div>

        {/* Quick date chips, for the modes that travel on a single day. */}
        {mode.fields.some((field) => field.name === 'date') ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-400">
              Quick pick
            </span>
            {[
              { label: 'Today', offset: 0 },
              { label: 'Tomorrow', offset: 1 },
              { label: 'This weekend', offset: (6 - new Date().getDay() + 7) % 7 },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => setValue('date', toInputDate(chip.offset))}
                className={cn(
                  'inline-flex min-h-9 cursor-pointer items-center rounded-full px-3.5 text-xs font-semibold transition-colors sm:min-h-8',
                  current.date === toInputDate(chip.offset)
                    ? 'bg-brand-surface text-brand-fg ring-1 ring-brand-border'
                    : 'bg-surface-muted text-ink-500 hover:text-ink-900',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        {summary ? (
          <p
            role="status"
            className="mt-4 rounded-2xl bg-brand-surface px-4 py-3 text-sm text-brand-fg-strong"
          >
            <span className="font-semibold">Ready to search {mode.label}</span>
            <span className="mt-1 block text-brand-fg">{summary}</span>
          </p>
        ) : null}

        {/* Below `lg` the button sits in the flow so it cannot land on top of
            the quick-pick chips; from `lg` it straddles the card's edge. */}
        <div className="mt-5 lg:absolute lg:-bottom-7 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2">
          <Button
            type="submit"
            size="lg"
            fullWidth
            className="shadow-lift lg:w-auto"
          >
            <SearchIcon className="h-5 w-5" />
            {mode.cta}
          </Button>
        </div>
      </form>


    </div>
  )
}
