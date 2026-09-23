/**
 * Field validators shared by every form.
 *
 * Each one takes the raw input string and returns a message to show, or null
 * when the value is fine. They are pure and know nothing about React, so the
 * same rule reads the same on the sign-up form, the passenger form and the
 * search panel — and can be unit-tested without rendering anything.
 *
 * The rules mirror what the API enforces (see each module's serializers), so
 * a form that passes here is not sent back with the same complaint. The
 * server still validates; this is about telling the traveller before the
 * round trip, next to the field, in words rather than a browser tooltip.
 */

export type FieldError = string | null

/** Errors keyed by field name. An empty object means the form is valid. */
export type FormErrors = Record<string, string>

export const hasErrors = (errors: FormErrors) => Object.keys(errors).length > 0

/**
 * Builds a FormErrors from `[name, result]` pairs, dropping the nulls. Keeps
 * each form's `validate` function to a flat list of rules.
 */
export function collectErrors(
  entries: Array<[string, FieldError]>,
): FormErrors {
  const errors: FormErrors = {}
  for (const [name, error] of entries) {
    if (error) errors[name] = error
  }
  return errors
}

/* ------------------------------------------------------------------
   Text
   ------------------------------------------------------------------ */

export function required(value: string, label: string): FieldError {
  return value.trim() ? null : `${label} is required.`
}

/**
 * A person's name as it appears on an ID: letters, spaces and the punctuation
 * names actually contain. Digits and symbols are almost always a slip — a
 * phone number in the wrong box — so they are refused rather than passed on.
 */
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u

export function personName(value: string, label = 'Name'): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return `${label} is required.`
  if (trimmed.length < 2) return `${label} looks too short.`
  if (trimmed.length > 150) return `${label} is too long.`
  if (!NAME_PATTERN.test(trimmed)) {
    return `${label} can only contain letters, spaces, hyphens and apostrophes.`
  }
  return null
}

/** Somewhere a driver can find: long enough to be a real address. */
export function address(value: string, label: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return `${label} is required.`
  if (trimmed.length < 5) return `${label} needs a little more detail.`
  if (trimmed.length > 500) return `${label} is too long.`
  return null
}

/** A city or place name as typed into a search box. */
export function place(value: string, label: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return `${label} is required.`
  if (trimmed.length < 2) return `${label} looks too short.`
  return null
}

/* ------------------------------------------------------------------
   Contact
   ------------------------------------------------------------------ */

// Deliberately loose: one @, something either side, a dot in the domain.
// Anything stricter rejects real addresses, and the confirmation email is
// what really proves it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function email(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'Email address is required.'
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address, like you@example.com.'
  }
  return null
}

/** An Indian mobile number: ten digits, first digit 6 to 9. */
const MOBILE_PATTERN = /^[6-9]\d{9}$/

export function mobile(value: string): FieldError {
  const digits = value.replace(/[\s-]/g, '')
  if (!digits) return 'Mobile number is required.'
  if (!/^\d+$/.test(digits)) return 'Mobile number can only contain digits.'
  if (digits.length !== 10) return 'Mobile number must be exactly 10 digits.'
  if (!MOBILE_PATTERN.test(digits)) {
    return 'Enter a valid Indian mobile number starting with 6, 7, 8 or 9.'
  }
  return null
}

/**
 * The sign-in box takes either. Which one it is decides which message to
 * give, so "abc" is told it is not an email rather than not a phone number.
 */
export function emailOrMobile(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter your email address or mobile number.'
  if (/^[\d\s-]+$/.test(trimmed)) return mobile(trimmed)
  return email(trimmed)
}

/* ------------------------------------------------------------------
   Account
   ------------------------------------------------------------------ */

/**
 * Mirrors Django's AUTH_PASSWORD_VALIDATORS as far as a client can: length
 * and all-numeric. The common-password list stays on the server.
 */
export function password(value: string): FieldError {
  if (!value) return 'Password is required.'
  if (value.length < 8) return 'Password must be at least 8 characters.'
  if (/^\d+$/.test(value)) return 'Password cannot be entirely numbers.'
  if (value.length > 128) return 'Password is too long.'
  return null
}

/* ------------------------------------------------------------------
   Numbers
   ------------------------------------------------------------------ */

export function age(value: string, { min = 1, max = 120 } = {}): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return 'Age is required.'
  if (!/^\d+$/.test(trimmed)) return 'Age must be a whole number.'
  const number = Number(trimmed)
  if (number < min || number > max) return `Age must be between ${min} and ${max}.`
  return null
}

/* ------------------------------------------------------------------
   Dates and times
   ------------------------------------------------------------------ */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Today as `YYYY-MM-DD` in local time; the date inputs speak the same. */
export function todayInput() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isRealDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  )
}

/**
 * A `YYYY-MM-DD` value. Strings compare correctly in that shape, which is
 * what makes `notBefore` / `after` a plain comparison.
 */
export function date(
  value: string,
  {
    label,
    notBefore,
    after,
    afterLabel,
  }: { label: string; notBefore?: string; after?: string; afterLabel?: string },
): FieldError {
  if (!value) return `${label} is required.`
  if (!isRealDate(value)) return `${label} is not a valid date.`
  if (notBefore && value < notBefore) return `${label} cannot be in the past.`
  if (after && value <= after) {
    return `${label} must be after ${afterLabel ?? 'the start date'}.`
  }
  return null
}

export function time(value: string, label = 'Time'): FieldError {
  if (!value) return `${label} is required.`
  if (!TIME_PATTERN.test(value)) return `${label} is not a valid time.`
  return null
}

/**
 * A date of birth that fits the traveller type on the date of travel.
 *
 * The airline's own definition: an infant is under 2 on the day of the flight
 * and a child is 2 to 11. Someone who will have turned 12 by then books as an
 * adult, which is why the travel date and not today is the reference.
 */
export function dateOfBirth(
  value: string,
  type: 'adult' | 'child' | 'infant',
  travelDate: string,
): FieldError {
  if (type === 'adult') return null
  if (!value) return 'Date of birth is required for children and infants.'
  if (!isRealDate(value)) return 'Date of birth is not a valid date.'
  if (value > todayInput()) return 'Date of birth cannot be in the future.'

  const years = yearsBetween(value, travelDate)
  if (type === 'infant' && years >= 2) {
    return 'An infant must be under 2 on the day of travel — book as a child.'
  }
  if (type === 'child' && years < 2) {
    return 'Under 2 on the day of travel — book as an infant.'
  }
  if (type === 'child' && years >= 12) {
    return 'A child must be under 12 on the day of travel — book as an adult.'
  }
  return null
}

function yearsBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let years = ty - fy
  if (tm < fm || (tm === fm && td < fd)) years -= 1
  return years
}
