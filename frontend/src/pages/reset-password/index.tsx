import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { Button, Container, Footer, Navbar, TextField } from '@/components'
import { useAuth } from '@/hooks'
import { useFormValidation } from '@/hooks/useFormValidation'
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  SpinnerIcon,
} from '@/icons'
import { ApiError } from '@/services/api'
import { INVALID_RESET_LINK, checkResetLink } from '@/services/auth.services'
import type { ResetLinkInfo } from '@/types/auth.types'
import type { NavTarget } from '@/types/home.types'
import type { FormErrors } from '@/utils/validation'
import { collectErrors, password } from '@/utils/validation'

/**
 * Where the emailed reset link lands: `/reset-password?uid=…&token=…`.
 *
 * The link is checked as the page opens, so a traveller holding an old one
 * is told straight away rather than after typing a new password twice.
 * Setting the password signs them in — that is where they were trying to get
 * to — and the server signs every other device out.
 */

type Phase =
  | { kind: 'checking' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; info: ResetLinkInfo }
  | { kind: 'done' }

interface Values {
  password: string
  confirm: string
}

function validate(values: Values): FormErrors {
  return collectErrors([
    ['password', password(values.password)],
    [
      'confirm',
      !values.confirm
        ? 'Type the new password again.'
        : values.confirm !== values.password
          ? 'The two passwords do not match.'
          : null,
    ],
  ])
}

/** A password box with the same show/hide eye the sign-in dialog has. */
function PasswordField({
  label,
  value,
  onChange,
  error,
  visible,
  onToggle,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  visible: boolean
  onToggle: () => void
  autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <TextField
        label={label}
        icon={LockIcon}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        autoFocus={autoFocus}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute top-[1.65rem] right-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
      >
        {visible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
      </button>
    </div>
  )
}

function Notice({
  tone,
  title,
  children,
  actions,
}: {
  tone: 'success' | 'danger'
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  const Icon = tone === 'success' ? CheckIcon : InfoIcon
  return (
    <div className="text-center">
      <span
        className={
          tone === 'success'
            ? 'mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-surface text-danger-fg'
        }
      >
        <Icon className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl sm:text-3xl">{title}</h1>
      <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        {children}
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        {actions}
      </div>
    </div>
  )
}

export function ResetPassword({
  uid,
  token,
  onNavigate,
  onOpenAccount,
  onGoHome,
}: {
  uid: string
  token: string
  onNavigate: (target: NavTarget) => void
  onOpenAccount: () => void
  onGoHome: () => void
}) {
  const { user, requestSignIn, resetPassword } = useAuth()
  const incomplete = !uid || !token

  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [values, setValues] = useState<Values>({ password: '', confirm: '' })
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<FormErrors>({})
  const { errors, submit } = useFormValidation(values, validate)

  useEffect(() => {
    if (incomplete) return
    const controller = new AbortController()

    checkResetLink(uid, token, controller.signal)
      .then((info) => setPhase({ kind: 'ready', info }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setPhase({
          kind: 'invalid',
          message:
            cause instanceof ApiError
              ? cause.message
              : 'That link could not be checked. Try it again in a moment.',
        })
      })

    return () => controller.abort()
  }, [uid, token, incomplete])

  const set = (field: keyof Values) => (value: string) => {
    setServerErrors({})
    setValues((current) => ({ ...current, [field]: value }))
  }

  const save = async () => {
    if (pending) return
    setPending(true)
    setFailure(null)

    try {
      await resetPassword(uid, token, values.password)
      setPhase({ kind: 'done' })
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === INVALID_RESET_LINK) {
        setPhase({ kind: 'invalid', message: cause.message })
      } else if (cause instanceof ApiError) {
        const fields = cause.fieldErrors()
        setServerErrors(fields)
        // A field message is shown under the field; anything else up here.
        if (!fields.password) setFailure(cause.message)
      } else {
        setFailure('Something went wrong. Try again.')
      }
    } finally {
      setPending(false)
    }
  }

  const askAgain = (
    <Button size="lg" onClick={() => requestSignIn('forgot')}>
      Ask for a new link
    </Button>
  )

  let body: ReactNode
  if (incomplete) {
    body = (
      <Notice
        tone="danger"
        title="This link is incomplete"
        actions={askAgain}
      >
        Part of the reset link is missing — some mail apps break long links
        across two lines. Open it from the email again, or ask for a new one.
      </Notice>
    )
  } else if (phase.kind === 'checking') {
    body = (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Checking your reset link…
      </p>
    )
  } else if (phase.kind === 'invalid') {
    body = (
      <Notice
        tone="danger"
        title="This link can no longer be used"
        actions={
          <>
            {askAgain}
            <Button size="lg" variant="secondary" onClick={() => requestSignIn('login')}>
              Log in
            </Button>
          </>
        }
      >
        {phase.message} Reset links work once, for an hour, and stop working
        if you have logged in since asking for one.
      </Notice>
    )
  } else if (phase.kind === 'done') {
    body = (
      <Notice
        tone="success"
        title="Your password has been changed"
        actions={
          <>
            <Button size="lg" onClick={onOpenAccount}>
              Go to my trips
            </Button>
            <Button size="lg" variant="secondary" onClick={onGoHome}>
              Start a search
            </Button>
          </>
        }
      >
        You are signed in
        {user ? (
          <>
            {' '}as <span className="font-semibold text-ink-700">{user.fullName}</span>
          </>
        ) : null}
        . Every other device that was signed in to this account has been
        signed out, and we have emailed you to say the password changed.
      </Notice>
    )
  } else {
    body = (
      <form
        onSubmit={submit(() => void save())}
        noValidate
        className="rounded-3xl bg-surface p-6 shadow-card ring-1 ring-hairline sm:p-8"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-surface text-brand-fg-strong">
          <LockIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-500">
          Hi {phase.info.firstName}, this is for the account at{' '}
          <span className="font-semibold text-ink-700">{phase.info.email}</span>.
        </p>

        <div className="mt-6 space-y-3">
          <PasswordField
            label="New password"
            value={values.password}
            onChange={set('password')}
            error={errors.password ?? serverErrors.password}
            visible={visible}
            onToggle={() => setVisible((current) => !current)}
            autoFocus
          />
          <PasswordField
            label="Confirm new password"
            value={values.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
            visible={visible}
            onToggle={() => setVisible((current) => !current)}
          />
          <p className="px-1 text-xs text-ink-500">
            At least 8 characters, not only numbers, and not a password that is
            easy to guess or close to your email.
          </p>
        </div>

        <Button type="submit" size="lg" fullWidth className="mt-6" disabled={pending}>
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Saving
            </span>
          ) : (
            'Set new password'
          )}
        </Button>

        {failure ? (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
          >
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{failure}</span>
          </div>
        ) : null}
      </form>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAuth={requestSignIn}
        onOpenAccount={onOpenAccount}
        onNavigate={onNavigate}
      />
      <main className="flex flex-1 items-start">
        <Container className="py-12 sm:py-20">
          <div className="mx-auto max-w-md">{body}</div>
        </Container>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  )
}
