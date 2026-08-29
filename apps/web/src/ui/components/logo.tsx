import { Link } from '@tanstack/react-router'
import { cn } from '@web/lib/utils.ts'

const LOGO_SIZE = {
  sm: 'text-wordmark-sm',
  md: 'text-wordmark',
  lg: 'text-wordmark-lg',
} as const

/** Props for the Porte wordmark. */
export type LogoProps = {
  readonly size?: keyof typeof LOGO_SIZE
  readonly className?: string
}

/**
 * Geometric wordmark closed by a terminal caret.
 *
 * The caret is sized in `em`, so it tracks the wordmark at every size.
 */
export function Logo({ size = 'md', className }: LogoProps) {
  return (
    <span className={cn(LOGO_SIZE[size], className)}>
      Porte
      <span
        aria-hidden
        className="ml-[0.12em] inline-block h-[1em] w-[0.4em] translate-y-[0.14em] bg-current"
      />
    </span>
  )
}

/**
 * The wordmark cut to its first letter and the caret: the icon for a favicon,
 * a home-screen tile, anywhere a word will not fit. Sized by the font size of
 * its parent, so one component serves 16px and 512px.
 */
export function LogoMark({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden className={cn('text-mark', className)}>
      P{/* The wordmark's caret, unchanged: the mark is the wordmark cut short. */}
      <span className="ml-[0.12em] inline-block h-[1em] w-[0.4em] translate-y-[0.14em] bg-current" />
    </span>
  )
}

/** The wordmark as the way home, above a page built around one decision. */
export function LogoLink({ size = 'lg' }: Pick<LogoProps, 'size'>) {
  return (
    <Link aria-label="Porte home" to="/">
      <Logo size={size} />
    </Link>
  )
}
