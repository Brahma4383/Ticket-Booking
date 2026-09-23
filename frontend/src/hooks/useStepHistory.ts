import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Gives each step of a booking flow its own history entry.
 *
 * Without this, a five-step wizard is one URL: the browser's Back button skips
 * the whole thing and leaves for wherever the search came from — or off the
 * site entirely, if the flow was opened from a link. Back should undo the last
 * thing that happened, and inside a wizard the last thing that happened was a
 * step.
 *
 * The step lives in `?step=` beside the search that opened the flow, so the
 * URL stays a complete description of what is on screen.
 *
 * ## One effect, because two would fight
 *
 * The step exists in two places — the flow's reducer and the URL — and either
 * can move first. A Continue button moves the reducer; the Back button moves
 * the URL. The obvious shape, one effect syncing each way, deadlocks: on a
 * Back press the URL changes while the reducer still holds the old step, and
 * the reducer-watching effect reads that as "the reducer moved" and pushes the
 * old step straight back on. The entry that was just popped is replaced, Back
 * appears to do nothing, and the flow is stuck.
 *
 * So there is one effect and one piece of memory: `agreed`, the step the URL
 * and the reducer were last seen holding together. Whichever of the two now
 * disagrees with it is the one that moved, and the other is made to follow.
 *
 * ## Which way the step moved decides what happens to history
 *
 * - **The first step** replaces, so entering a flow costs one entry, not two.
 * - **Forward** pushes. That is the entry Back will return through.
 * - **Backward** replaces. The in-app "Back to seat selection" controls move
 *   the reducer like any other control, and a backward move that *pushed*
 *   would leave the browser's Back pointing at the step just left — press it
 *   and you would go forwards. Replacing keeps the two buttons agreeing.
 * - **The last step** replaces: a ticket is paid for, and its history entry
 *   should not be a payment form somebody can be dropped back onto.
 *
 * ## A step in the URL is not a step you can jump to
 *
 * The flow's state lives in a reducer, so a reload empties it. Opening
 * `/bus?…&step=payment` in a fresh tab would otherwise render a payment step
 * with no trip and no seats behind it. Only a step already reached in this
 * mount is honoured, and anything else rewrites the URL back to the first
 * step — which still allows the browser's Forward button, since by then the
 * state for it exists.
 */
export function useStepHistory<Step extends string>({
  step,
  order,
  goTo,
}: {
  /** The flow's current step, from its reducer. */
  step: Step
  /** Every step in order, as the flow's own `STEP_ORDER` lists them. */
  order: readonly Step[]
  /** Moves the reducer, when the browser is the one asking. */
  goTo: (step: Step) => void
}) {
  const [params, setParams] = useSearchParams()
  const urlStep = params.get('step')

  const index = order.indexOf(step)

  /**
   * The furthest step this mount has legitimately reached.
   *
   * Raised in an effect rather than during render: a ref written while
   * rendering is read at a different time than it is set, and under Strict
   * Mode it is written twice.
   */
  const reached = useRef(0)
  useEffect(() => {
    if (index > reached.current) reached.current = index
  }, [index])

  /** The step the URL and the reducer last held together. */
  const agreed = useRef<Step>(step)

  useEffect(() => {
    const write = (target: Step, replace: boolean) => {
      agreed.current = target
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set('step', target)
          return next
        },
        { replace },
      )
    }

    // The reducer moved: a Continue button, or a Back control inside the page.
    if (step !== agreed.current) {
      const from = order.indexOf(agreed.current)
      write(
        step,
        index === 0 || index < from || index === order.length - 1,
      )
      return
    }

    // Otherwise the URL is the one out of step. Either the browser moved —
    // Back, Forward — or the address bar holds something the state cannot
    // honour.
    if (urlStep === step) return

    const asked = urlStep ? order.indexOf(urlStep as Step) : -1
    if (asked >= 0 && asked <= reached.current) {
      agreed.current = order[asked]
      goTo(order[asked])
      return
    }

    // A missing, unknown or not-yet-reached step. This also covers the first
    // render, where the URL simply has no `step` yet.
    write(step, true)
  }, [step, index, urlStep, order, goTo, setParams])
}
