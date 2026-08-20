import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'
import { Avatar, AvatarFallback, AvatarImage } from '#/ui/components/ui/avatar.tsx'
import { Card, CardContent, CardFooter } from '#/ui/components/ui/card.tsx'

/**
 * Semantic color for a pairing status icon.
 *
 * Tone says what a screen means for the person, not whether it is the happy
 * path. Routine outcomes stay neutral so that the one screen worth alarming
 * them about still reads as an alarm.
 */
export type PairingTone = 'neutral' | 'success' | 'warning' | 'destructive'

const TONE_CLASS = {
  neutral: 'text-muted-foreground',
  success: 'text-status-success-muted-foreground',
  warning: 'text-status-warning-muted-foreground',
  destructive: 'text-destructive-muted-foreground',
} as const

/**
 * One card, the same on every pairing screen.
 *
 * Three sizes and no more: a card title, body text, and a footnote. Weight is
 * carried by the element, so nothing here decides its own type scale.
 */
export function PairingLayout({
  title,
  icon,
  children,
  actions,
  footnote,
}: {
  readonly title: string
  readonly icon?: ReactNode
  readonly children?: ReactNode
  readonly actions?: ReactNode
  readonly footnote?: string
}) {
  return (
    <Card className="text-center">
      <CardContent className="flex flex-col items-center gap-4">
        {icon}
        <h3>{title}</h3>
        {children}
      </CardContent>
      {actions || footnote ? (
        <CardFooter className="flex-col gap-3">
          {actions}
          {footnote ? <small className="w-full text-muted-foreground">{footnote}</small> : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}

/** Status icon colored by pairing tone. */
export function PairingStatusIcon({
  tone,
  children,
}: {
  readonly tone: PairingTone
  readonly children: ReactNode
}) {
  return <div className={cn('flex items-center justify-center', TONE_CLASS[tone])}>{children}</div>
}

/** The account a decision will be made on behalf of, with its picture. */
export function PairingAccount({
  label,
  image,
}: {
  readonly label: string
  readonly image?: string | null
}) {
  return (
    <p className="flex items-center justify-center gap-2 text-muted-foreground">
      <Avatar className="size-6">
        {image ? <AvatarImage alt="" src={image} /> : null}
        <AvatarFallback>{label.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span>
        Signed in as <strong className="text-foreground">{label}</strong>
      </span>
    </p>
  )
}
