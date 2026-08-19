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

/** Geometric wordmark for marketing and pairing surfaces. */
export function Logo({ size = 'md', className }: LogoProps) {
  return <span className={cn(LOGO_SIZE[size], className)}>Porte</span>
}
