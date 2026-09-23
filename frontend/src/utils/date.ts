/** `YYYY-MM-DD` for an `<input type="date">` value, offset by `daysFromToday`. */
export function toInputDate(daysFromToday = 0) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  return date.toLocaleDateString('en-CA')
}

/** e.g. `Thu, 17 Sep` — used for the readable hint under a date field. */
export function formatLongDate(value: string) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * `YYYY-MM-DD` -> "4 September 2026".
 *
 * Separate from `formatLongDate`, which drops the year and leads with the
 * weekday: right for a journey next week, wrong for a press release from
 * last year.
 */
export function formatDateWithYear(value: string) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Moves a `YYYY-MM-DD` value by whole days, staying in the same format. */
export function shiftInputDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

/** True when the value is on or before today, used to stop browsing backwards. */
export function isOnOrBeforeToday(value: string) {
  return value <= toInputDate()
}
