import { useState } from 'react'

import { Button } from '@/components/Button'
import { TextField } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BRAND } from '@/constants'
import { useAuth, useAuthDialog } from '@/hooks/useAuth'
import { useFormValidation } from '@/hooks/useFormValidation'
import {
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
import { ACCOUNT_NOT_FOUND } from '@/services/auth.services'
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
 */
function initialValues(prefill: string): AuthValues {
  const trimmed = prefill.trim()
  if (!trimmed) return EMPTY

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
}: {
  mode: AuthMode
  /** Carried over when the sign-in box sent them here to register. */
  prefill: string
  /** Switches to the sign-up tab, keeping what they typed. */
  onRegisterInstead: (identifier: string) => void
}) {
  const { login, register } = useAuth()
  const isLogin = mode === 'login'

  const [values, setValues] = useState<AuthValues>(() => initialValues(prefill))
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
        placeholder={isLogin ? 'you@example.com or 98765 43210' : 'you@example.com'}
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
        />
      ) : null}
    </Modal>
  )
}
