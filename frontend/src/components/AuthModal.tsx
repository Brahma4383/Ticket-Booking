import { useEffect, useState } from 'react'

import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BRAND } from '@/constants'
import { useAuth, useAuthDialog } from '@/hooks/useAuth'
import { useFormValidation } from '@/hooks/useFormValidation'
import {
  ArrowLeftIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  SpinnerIcon,
  UserIcon,
} from '@/icons'
import { ApiError } from '@/services/api'
import {
  ACCOUNT_NOT_FOUND,
  requestPasswordReset,
} from '@/services/auth.services'
import type { AuthMode } from '@/types/auth.types'
import { cn } from '@/utils'
import type { FormErrors } from '@/utils/validation'
import {
  collectErrors,
  email,
  emailOrMobile,
  mobile,
  password,
  personName,
  required,
} from '@/utils/validation'

const COPY: Record<AuthMode, { title: string; subtitle: string; cta: string }> =
  {
    login: {
      title: 'Welcome back',
      subtitle: 'Log in to see your trips, refunds and saved travellers.',
      cta: 'Log in',
    },
    signup: {
      title: `Create your ${BRAND.name} account`,
      subtitle: 'One account for buses, trains, flights, hotels and cabs.',
      cta: 'Create account',
    },
    forgot: {
      title: 'Forgot your password?',
      subtitle:
        'Enter the email or mobile number on your account and we will email you a link to choose a new one.',
      cta: 'Email me a reset link',
    },
  }

interface AuthValues {
  fullName: string
  email: string
  phone: string
  password: string
  terms: boolean
}

const EMPTY: AuthValues = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  terms: false,
}

/**
 * A sign-up opened from "you have not registered yet" starts with whatever
 * was typed into the sign-in box, dropped into whichever field it belongs in.
 * Retyping it is the one thing someone in that position has already done.
 *
 * The log-in tab has one box for both, so coming back to it from the reset
 * form puts the email or mobile straight into that.
 */
function initialValues(prefill: string, mode: AuthMode): AuthValues {
  const trimmed = prefill.trim()
  if (!trimmed) return EMPTY
  if (mode === 'login') return { ...EMPTY, email: trimmed }

  const digits = trimmed.replace(/[\s-]/g, '')
  return /^\d{10}$/.test(digits)
    ? { ...EMPTY, phone: digits }
    : { ...EMPTY, email: trimmed }
}

/** The sign-in box takes an email or a mobile; the password just has to be there. */
function validateLogin(values: AuthValues): FormErrors {
  return collectErrors([
    ['email', emailOrMobile(values.email)],
    ['password', required(values.password, 'Password')],
  ])
}

/** Mirrors what `POST /api/auth/register/` checks, so it is not sent back. */
function validateSignup(values: AuthValues): FormErrors {
  return collectErrors([
    ['fullName', personName(values.fullName, 'Full name')],
    ['email', email(values.email)],
    ['phone', mobile(values.phone)],
    ['password', password(values.password)],
    ['terms', values.terms ? null : 'Please agree to the terms to continue.'],
  ])
}

/**
 * Mounted with `key={mode}` so switching tabs (or reopening the dialog) throws
 * away the values, the password-visibility and the error state without an
 * effect.
 */
function AuthForm({
  mode,
  prefill,
  onRegisterInstead,
  onForgot,
}: {
  mode: AuthMode
  /** Carried over when the sign-in box sent them here to register. */
  prefill: string
  /** Switches to the sign-up tab, keeping what they typed. */
  onRegisterInstead: (identifier: string) => void
  /** Switches to the reset form, keeping the email or mobile typed. */
  onForgot: (identifier: string) => void
}) {
  const { login, register } = useAuth()
  const isLogin = mode === 'login'

  const [values, setValues] = useState<AuthValues>(() =>
    initialValues(prefill, mode),
  )
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  // A failed sign-in says one of two things. An identifier nobody has
  // registered is not really an error - it is the wrong door - so it gets the
  // sign-up button below rather than the red box.
  const [alert, setAlert] = useState<{
    notRegistered: boolean
    text: string
  } | null>(null)
  // What the server objected to, keyed like the inputs are named. Cleared on
  // the next edit so "already registered" does not outlive the fix.
  const [serverErrors, setServerErrors] = useState<FormErrors>({})

  const { errors, submit } = useFormValidation(
    values,
    isLogin ? validateLogin : validateSignup,
  )

  const set =
    <K extends keyof AuthValues>(key: K) =>
    (value: AuthValues[K]) => {
      setServerErrors({})
      setValues((previous) => ({ ...previous, [key]: value }))
    }

  const fieldError = (name: keyof AuthValues) =>
    errors[name] ?? serverErrors[name]

  const handleValid = async () => {
    if (pending) return
    setPending(true)
    setAlert(null)

    try {
      if (isLogin) {
        await login(values.email.trim(), values.password)
      } else {
        await register({
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          phone: values.phone.replace(/[\s-]/g, ''),
          password: values.password,
        })
      }
      // The provider closes the dialog on success; this form unmounts.
    } catch (error) {
      if (error instanceof ApiError) {
        setAlert({
          notRegistered: isLogin && error.code === ACCOUNT_NOT_FOUND,
          text: error.message,
        })
        setServerErrors(error.fieldErrors())
      } else {
        setAlert({
          notRegistered: false,
          text: 'Something went wrong. Try again.',
        })
      }
      setPending(false)
    }
  }

  return (
    // `noValidate`: the messages below replace the browser's tooltips, which
    // cannot be styled and vanish on the next click.
    <form className="mt-5 space-y-3" onSubmit={submit(handleValid)} noValidate>
      {isLogin ? null : (
        <TextField
          label="Full name"
          icon={UserIcon}
          name="fullName"
          autoComplete="name"
          placeholder="As printed on your ID"
          value={values.fullName}
          onChange={(event) => set('fullName')(event.target.value)}
          error={fieldError('fullName')}
        />
      )}

      <TextField
        label={isLogin ? 'Email or mobile' : 'Email address'}
        icon={MailIcon}
        name="email"
        type={isLogin ? 'text' : 'email'}
        autoComplete={isLogin ? 'username' : 'email'}
        placeholder={isLogin ? 'demo@gmail.com or 98765 43210' : 'demo@gmail.com'}
        value={values.email}
        onChange={(event) => set('email')(event.target.value)}
        error={fieldError('email') ?? serverErrors.identifier}
      />

      {isLogin ? null : (
        <TextField
          label="Mobile number"
          icon={PhoneIcon}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="10-digit number"
          maxLength={12}
          value={values.phone}
          onChange={(event) => set('phone')(event.target.value)}
          error={fieldError('phone')}
        />
      )}

      <div className="relative">
        <TextField
          label="Password"
          icon={LockIcon}
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
          value={values.password}
          onChange={(event) => set('password')(event.target.value)}
          error={fieldError('password')}
          // Room for the eye button, which sits over the input's right edge.
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute top-[1.65rem] right-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
        >
          {showPassword ? (
            <EyeOffIcon className="h-5 w-5" />
          ) : (
            <EyeIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {isLogin ? (
        <div className="flex items-center justify-between pt-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-500">
            <Checkbox
              name="remember"
              defaultChecked
              className="cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
            />
            Keep me signed in
          </label>
          <button
            type="button"
            onClick={() => onForgot(values.email)}
            className="cursor-pointer rounded-full px-1 text-sm font-semibold text-brand-fg transition-colors hover:text-brand-fg-strong hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            Forgot password?
          </button>
        </div>
      ) : (
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 pt-0.5 text-sm text-ink-500">
            <Checkbox
              name="terms"
              checked={values.terms}
              onCheckedChange={(next) => set('terms')(next === true)}
              aria-invalid={errors.terms ? true : undefined}
              className="mt-0.5 cursor-pointer border-ink-400/60 data-checked:border-brand-600 data-checked:bg-brand-600"
            />
            <span>
              I agree to the{' '}
              <span className="font-semibold text-ink-700">Terms of use</span>{' '}
              and{' '}
              <span className="font-semibold text-ink-700">Privacy policy</span>.
            </span>
          </label>
          {errors.terms ? (
            <p role="alert" className="mt-1.5 px-1 text-xs font-medium text-danger-fg">
              {errors.terms}
            </p>
          ) : null}
        </div>
      )}

      <Button type="submit" size="lg" fullWidth className="mt-2" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            {isLogin ? 'Logging in' : 'Creating account'}
          </span>
        ) : (
          COPY[mode].cta
        )}
      </Button>

      {alert?.notRegistered ? (
        // Not styled as a failure: nothing is wrong with what they typed,
        // there is simply no account behind it yet. The button is the point -
        // it carries the email or mobile straight into the sign-up form.
        <div
          role="alert"
          className="rounded-2xl bg-brand-surface px-4 py-3.5 text-sm text-brand-fg-strong ring-1 ring-brand-border"
        >
          <div className="flex items-start gap-2">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{alert.text}</span>
          </div>
          <Button
            size="sm"
            fullWidth
            className="mt-3"
            onClick={() => onRegisterInstead(values.email)}
          >
            Create an account
          </Button>
        </div>
      ) : alert ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
        >
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{alert.text}</span>
        </div>
      ) : null}
    </form>
  )
}

/** How long "Send again" waits, so a double-click is not two emails. */
const RESEND_AFTER_SECONDS = 30

/**
 * "Email me a reset link": one field, then a confirmation in its place.
 *
 * The confirmation is worded the same whether or not an account matched,
 * because the API answers the same either way — a reset form must not be a
 * way to find out who is registered. The link itself opens `/reset-password`.
 */
function ForgotForm({
  prefill,
  onBack,
}: {
  /** Whatever was in the log-in box when "Forgot password?" was pressed. */
  prefill: string
  /** Back to the log-in tab, carrying the identifier. */
  onBack: (identifier: string) => void
}) {
  const [identifier, setIdentifier] = useState(prefill.trim())
  const [pending, setPending] = useState(false)
  /** The identifier the last link went to, once one has. */
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [minutes, setMinutes] = useState(60)
  const [cooldown, setCooldown] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | undefined>()

  const { errors, submit } = useFormValidation({ identifier }, (values) =>
    collectErrors([['identifier', emailOrMobile(values.identifier)]]),
  )

  // One tick a second while "Send again" is waiting.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const send = async () => {
    if (pending) return
    setPending(true)
    setFailure(null)

    const target = identifier.trim()
    try {
      const result = await requestPasswordReset(target)
      setSentTo(target)
      setMinutes(result.expiresInMinutes)
      setCooldown(RESEND_AFTER_SECONDS)
    } catch (error) {
      if (error instanceof ApiError) {
        const field = error.fieldErrors().identifier
        // A field message goes under the field; anything else - too many
        // requests, a dead server - in the box below the button.
        setServerError(field)
        setFailure(field ? null : error.message)
      } else {
        setFailure('Something went wrong. Try again.')
      }
    } finally {
      setPending(false)
    }
  }

  const failureBox = failure ? (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-fg"
    >
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{failure}</span>
    </div>
  ) : null

  const back = (
    <button
      type="button"
      onClick={() => onBack(sentTo ?? identifier)}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      Back to log in
    </button>
  )

  if (sentTo !== null) {
    return (
      <div className="mt-5 space-y-4">
        <div
          role="status"
          className="rounded-2xl bg-brand-surface px-4 py-4 text-sm text-brand-fg-strong ring-1 ring-brand-border"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
              <MailIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold">Check your inbox</p>
              <p className="mt-1 leading-relaxed">
                If an account matches{' '}
                <span className="font-semibold break-words">{sentTo}</span>, we
                have emailed it a link to choose a new password. The link works
                once, for the next {minutes} minutes.
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-ink-500">
          Nothing after a few minutes? Check your spam folder, make sure it is
          the email or mobile you signed up with, then send it again.
        </p>

        {failureBox}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {back}
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || cooldown > 0}
            onClick={() => void send()}
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Sending
              </span>
            ) : cooldown > 0 ? (
              `Send again in ${cooldown}s`
            ) : (
              'Send again'
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={submit(() => void send())}
      noValidate
    >
      <TextField
        label="Email or mobile"
        icon={MailIcon}
        name="identifier"
        autoComplete="username"
        placeholder="demo@gmail.com or 98765 43210"
        value={identifier}
        onChange={(event) => {
          setServerError(undefined)
          setIdentifier(event.target.value)
        }}
        error={errors.identifier ?? serverError}
        autoFocus
      />

      <Button type="submit" size="lg" fullWidth className="mt-2" disabled={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Sending link
          </span>
        ) : (
          COPY.forgot.cta
        )}
      </Button>

      {failureBox}

      <div className="pt-1">{back}</div>
    </form>
  )
}

/**
 * The sign-in dialog.
 *
 * Rendered once, at the app root, and opened from anywhere with
 * `useAuth().requestSignIn()` — the payment step needs it from several levels
 * inside a booking wizard.
 */
export function AuthModal() {
  // `prefill` is the identifier the sign-in box carried over, if any; the
  // provider clears it whenever the dialog closes.
  const { mode, prefill, setMode, close } = useAuthDialog()
  const copy = COPY[mode ?? 'login']

  return (
    <Modal
      open={mode !== null}
      onClose={close}
      title={copy.title}
      subtitle={copy.subtitle}
    >
      {mode === 'forgot' ? (
        // Not a tab: it is a detour from logging in, and "Back to log in"
        // is the way out of it.
        <ForgotForm
          prefill={prefill}
          onBack={(identifier) => setMode('login', identifier)}
        />
      ) : (
        <>
          <Tabs
            value={mode ?? 'login'}
            onValueChange={(value) => setMode(value as AuthMode)}
            className="gap-0"
          >
            <TabsList
              aria-label="Authentication mode"
              className="grid h-auto w-full grid-cols-2 gap-1 rounded-full bg-surface-muted p-1"
            >
              {(['login', 'signup'] as AuthMode[]).map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    'h-auto cursor-pointer rounded-full border-0 px-4 py-2 text-sm font-semibold text-ink-500 transition-colors after:hidden',
                    'hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                    'data-active:bg-surface data-active:text-ink-900 data-active:shadow-card dark:data-active:border-0 dark:data-active:bg-surface',
                  )}
                >
                  {value === 'login' ? 'Log in' : 'Sign up'}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {mode ? (
            <AuthForm
              key={mode}
              mode={mode}
              prefill={prefill}
              onRegisterInstead={(identifier) => setMode('signup', identifier)}
              onForgot={(identifier) => setMode('forgot', identifier)}
            />
          ) : null}
        </>
      )}
    </Modal>
  )
}
