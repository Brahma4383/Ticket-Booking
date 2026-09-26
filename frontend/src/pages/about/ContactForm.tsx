import { useState } from 'react'

import { Button, SelectField, TextField } from '@/components'
import { Textarea } from '@/components/ui/textarea'
import { BRAND } from '@/constants'
import { useFormValidation } from '@/hooks'
import { CheckIcon, InfoIcon, MailIcon, SpinnerIcon, UserIcon } from '@/icons'
import { ApiError } from '@/services/api'
import { sendContactMessage } from '@/services/contact.services'
import type { FieldError, FormErrors } from '@/utils/validation'
import { collectErrors, email, personName } from '@/utils/validation'

/** Must match the server's own list, which refuses anything else. */
const TOPICS = [
  'General enquiry',
  'Booking help',
  'Refund or cancellation',
  'Partner with us',
  'Press',
]

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  topic: TOPICS[0],
  message: '',
}

type Values = typeof EMPTY

/** Optional here, unlike the booking forms: a mail address is enough to reply. */
function optionalMobile(value: string): FieldError {
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^(?:\+?91[\s-]?)?[6-9]\d{9}$/.test(trimmed.replace(/\s/g, ''))
    ? null
    : 'Enter a ten digit mobile number, or leave this blank.'
}

function validate(values: Values): FormErrors {
  return collectErrors([
    ['name', personName(values.name, 'Your name')],
    ['email', email(values.email)],
    ['phone', optionalMobile(values.phone)],
    [
      'message',
      values.message.trim().length < 20
        ? 'Please say a little more, twenty characters at least, so we can answer properly.'
        : null,
    ],
  ])
}

/**
 * The contact form on the about page.
 *
 * Nothing is stored anywhere: the message is posted to `/api/contact/`, which
 * mails it to the support inbox and forgets it. The reply comes by email, so
 * the address field is the one thing besides the message that is required.
 */
export function ContactForm() {
  const [values, setValues] = useState<Values>(EMPTY)
  // The honeypot lives outside `values` so it is never part of validation,
  // and is only read when the form is submitted.
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const { errors, submit, reset } = useFormValidation(values, validate)

  const set = (field: keyof Values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const send = () => {
    setBusy(true)
    setFailure(null)

    sendContactMessage({ ...values, website })
      .then(() => {
        setSent(true)
        setValues(EMPTY)
        setWebsite('')
        reset()
      })
      .catch((cause: unknown) => {
        setFailure(
          cause instanceof ApiError
            ? cause.message
            : 'Your message could not be sent. Please try again, or call us.',
        )
      })
      .finally(() => setBusy(false))
  }

  if (sent) {
    return (
      <div className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-success-surface text-success-fg">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-5 text-xl">Message sent</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          It is with the support desk now. Someone answers within four hours on
          a working day, to the email address you gave. If it is urgent, call{' '}
          {BRAND.supportPhone}.
        </p>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => setSent(false)}
        >
          Write another
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit(send)}
      noValidate
      className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline sm:p-8"
    >
      <h3 className="text-xl">Contact us</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">
        A question, a complaint or an offer to work together. It reaches the
        support desk as an email, and the reply comes to the address you give.
      </p>

      <div className="mt-6 grid gap-3">
        <TextField
          label="Your name"
          name="name"
          autoComplete="name"
          placeholder="Asha Menon"
          icon={UserIcon}
          value={values.name}
          error={errors.name}
          onChange={(event) => set('name')(event.target.value)}
        />

        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="demo@gmail.com"
          icon={MailIcon}
          value={values.email}
          error={errors.email}
          onChange={(event) => set('email')(event.target.value)}
        />

        <TextField
          label="Mobile (optional)"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="98765 43210"
          value={values.phone}
          error={errors.phone}
          onChange={(event) => set('phone')(event.target.value)}
        />

        <SelectField
          label="What is it about?"
          name="topic"
          options={TOPICS}
          value={values.topic}
          onChange={set('topic')}
        />

        {/* Not the Field component: this one needs a textarea, and the shell
            is built around a single-line control. */}
        <div>
          <label
            htmlFor="contact-message"
            className="block text-[0.68rem] font-semibold tracking-[0.06em] text-ink-400 uppercase"
          >
            Message
          </label>
          <Textarea
            id="contact-message"
            name="message"
            rows={4}
            maxLength={2000}
            placeholder="Tell us what happened, and what would put it right."
            value={values.message}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? 'contact-message-error' : undefined}
            onChange={(event) => set('message')(event.target.value)}
            className={[
              // The site's field box, over shadcn's defaults.
              'mt-1.5 min-h-28 w-full resize-y rounded-2xl border-0 bg-surface px-4 py-3 text-[0.95rem] md:text-[0.95rem]',
              'text-ink-900 ring-1 outline-none transition-shadow dark:bg-surface',
              'placeholder:text-ink-400 focus-visible:border-0',
              errors.message
                ? 'ring-danger-border focus-visible:ring-2 focus-visible:ring-danger-fg aria-invalid:ring-2 aria-invalid:ring-danger-fg'
                : 'ring-hairline hover:ring-brand-border focus-visible:ring-2 focus-visible:ring-brand-500',
            ].join(' ')}
          />
          {errors.message ? (
            <p
              id="contact-message-error"
              className="mt-1.5 text-xs font-semibold text-danger-fg"
            >
              {errors.message}
            </p>
          ) : null}
        </div>

        {/* The honeypot. Hidden from people and from screen readers; a bot
            filling in every field it finds gives itself away. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
      </div>

      {failure !== null ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
        >
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{failure}</span>
        </div>
      ) : null}

      <Button type="submit" size="lg" fullWidth className="mt-5" disabled={busy}>
        {busy ? (
          <>
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          'Send message'
        )}
      </Button>

      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        We use what you write here to answer you, and nothing else. It is not
        stored on the website.
      </p>
    </form>
  )
}
