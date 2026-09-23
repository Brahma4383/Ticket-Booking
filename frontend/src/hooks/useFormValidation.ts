import type { FormEvent } from 'react'
import { useState } from 'react'

import type { FormErrors } from '@/utils/validation'
import { hasErrors } from '@/utils/validation'

/**
 * Validate-on-submit, then live.
 *
 * Errors are not shown until the traveller first tries to continue: red text
 * appearing under an empty field the moment a form opens reads as an
 * accusation. After that first attempt, the errors are recomputed from the
 * current values on every render, so each one disappears as it is fixed.
 *
 * The errors are *derived* rather than stored — `attempted` is the only
 * state. That is what keeps them in step with values the parent owns without
 * an effect writing state after the fact.
 *
 *   const { errors, submit } = useFormValidation(values, validate)
 *   <form onSubmit={submit(onContinue)}>
 *   <TextField error={errors.name} ... />
 */
export function useFormValidation<V>(
  values: V,
  validate: (values: V) => FormErrors,
) {
  const [attempted, setAttempted] = useState(false)

  const errors: FormErrors = attempted ? validate(values) : {}

  /**
   * Wraps a submit handler. Prevents the default, validates, and only calls
   * `onValid` when everything passes. On failure the first invalid field is
   * focused, which also scrolls it into view on a long form.
   */
  const submit =
    (onValid: () => void) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const current = validate(values)
      setAttempted(true)

      if (hasErrors(current)) {
        focusFirstInvalid(event.currentTarget)
        return
      }
      onValid()
    }

  /**
   * Back to the pre-attempt state. For a form whose fields change under it -
   * the search panel switching from buses to hotels - so an old attempt does
   * not flag the new tab's empty fields on arrival.
   */
  const reset = () => setAttempted(false)

  return { errors, attempted, submit, reset }
}

/**
 * Runs after React has re-rendered with the errors applied, so the
 * `aria-invalid` the field components set is there to be found.
 */
function focusFirstInvalid(form: HTMLFormElement) {
  window.setTimeout(() => {
    const field = form.querySelector<HTMLElement>('[aria-invalid="true"]')
    field?.focus()
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, 0)
}
