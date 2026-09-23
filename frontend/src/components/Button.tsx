import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Slot } from 'radix-ui'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/utils'

/**
 * The site's button, on shadcn's.
 *
 * shadcn's `buttonVariants` supplies the parts a button is easy to get wrong
 * — the focus ring, the disabled state, the icon spacing, the `aria-invalid`
 * styling — and this layer supplies the parts that make it *this* site's:
 * pill-shaped, in the brand orange, with the four variants and three sizes
 * every page already asks for by name. The public API is unchanged, so no
 * call site knows anything happened underneath.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'accent'
type Size = 'sm' | 'md' | 'lg'

/** Which shadcn variant each of ours starts from, before the overrides. */
const BASE: Record<Variant, 'default' | 'outline' | 'ghost'> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  accent: 'default',
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md active:bg-brand-800',
  secondary:
    'border-transparent bg-surface text-ink-700 ring-1 ring-hairline hover:bg-surface-muted hover:text-ink-700 hover:ring-brand-border',
  ghost: 'text-ink-600 hover:bg-surface-muted hover:text-ink-900',
  accent:
    'bg-accent-500 text-ink-900 shadow-sm hover:bg-accent-400 active:bg-accent-600',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-14 px-8 text-base gap-2.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  /**
   * Renders the child element instead of a `<button>`, passing the styling
   * through — for a link that should look like a button.
   */
  asChild?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  asChild = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      type={asChild ? undefined : type}
      data-slot="button"
      data-variant={variant}
      className={cn(
        buttonVariants({ variant: BASE[variant], size: 'default' }),
        // shadcn's defaults are a rounded rectangle at 32px; the site's are a
        // pill at 36-56px. `cn` resolves the conflicts in this order.
        'cursor-pointer rounded-full font-semibold whitespace-nowrap',
        'transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out',
        // Press feedback: a hair smaller under the pointer, back on release.
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  )
}
