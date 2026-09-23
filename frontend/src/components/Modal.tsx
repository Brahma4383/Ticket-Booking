import type { ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CloseIcon } from '@/icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Sits under the title inside the dialog header. */
  subtitle?: string
  children: ReactNode
}

/**
 * The site's dialog, on shadcn's.
 *
 * Radix owns the parts a dialog gets wrong when written by hand: the focus
 * trap, restoring focus to what opened it, Escape, the click on the backdrop,
 * the scroll lock, and `aria-modal` with a real label. This layer keeps the
 * site's shape — a bottom sheet on a phone that becomes a centred card from
 * `sm` up — and the `open`/`onClose`/`title`/`subtitle` API every caller
 * already uses.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        className={
          // shadcn centres a small card; the site's dialog is a full-width
          // sheet rising from the bottom on a phone. Both positions are
          // written out here so `cn` replaces rather than adds to them.
          'top-auto bottom-0 left-0 max-h-[92vh] w-full max-w-none translate-x-0 translate-y-0 ' +
          'gap-0 overflow-y-auto rounded-t-3xl rounded-b-none bg-surface p-6 text-base shadow-lift ring-hairline ' +
          'sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-8 ' +
          'data-open:slide-in-from-bottom-4 sm:data-open:slide-in-from-bottom-0'
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <DialogHeader className="gap-0">
          <DialogTitle className="text-2xl font-bold tracking-tight text-ink-900">
            {title}
          </DialogTitle>
          {subtitle ? (
            <DialogDescription className="mt-1.5 text-sm text-ink-500">
              {subtitle}
            </DialogDescription>
          ) : (
            // Radix warns when a dialog has no description; an empty one is
            // the honest answer for a dialog whose title says it all.
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-6">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
