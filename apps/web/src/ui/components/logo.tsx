import { cn } from '#/lib/utils.ts'

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
