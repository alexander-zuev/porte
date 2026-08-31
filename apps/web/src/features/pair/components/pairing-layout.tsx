import { CheckIcon, WarningIcon } from '@phosphor-icons/react'
import { buildImageProxyUrl, type PairingOrigin } from '@porte/core/client'
import { cn } from '@web/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Avatar, AvatarFallback, AvatarImage } from '@web/ui/components/ui/avatar.tsx'
import { Card, CardContent, CardFooter } from '@web/ui/components/ui/card.tsx'
import type { ReactNode } from 'react'

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
  alert,
  account,
  children,
  actions,
  footnote,
}: {
  readonly title: string
  readonly icon?: ReactNode
  /** Sits above the card, not in it: it is about the request, not the decision. */
  readonly alert?: ReactNode
  /** Who the decision acts for. Sits with the title, not with the body. */
  readonly account?: ReactNode
  readonly children?: ReactNode
  readonly actions?: ReactNode
  readonly footnote?: string
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      {alert}
      <Card className="text-center">
        <CardContent className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            {icon}
            <h1>{title}</h1>
            {account}
          </div>
          {children}
        </CardContent>
        {actions || footnote ? (
          <CardFooter className="flex-col gap-3">
            {actions}
            {footnote ? <small className="w-full text-muted-foreground">{footnote}</small> : null}
          </CardFooter>
        ) : null}
      </Card>
    </div>
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

/**
 * Where the request came from, when that is worth saying.
 *
 * Silent on a match: both halves normally happen on one machine, so an address on
 * screen every time trains the eye to skip it. `unknown` still speaks, because
 * a failed lookup must never read like a confirmed one.
 */
export function PairingRequestOrigin({ origin }: { readonly origin: PairingOrigin }) {
  // A match is the ordinary case. It is stated inside the card, not raised above it.
  if (origin.origin === 'this-device') return null

  return (
    <Alert variant="warning">
      <WarningIcon aria-hidden />
      <AlertTitle>
        {origin.origin === 'unknown'
          ? 'We could not confirm where this came from'
          : 'This did not come from this device'}
      </AlertTitle>
      <AlertDescription>
        {origin.origin === 'unknown'
          ? 'Continue only if you just ran /remote-control here'
          : `Requested from ${origin.location} (${origin.ipAddress}) at ${at(origin.requestedAt)}. Make sure you trust it: it will be able to act on your account.`}
      </AlertDescription>
    </Alert>
  )
}

/** The reader's own clock, since they are judging "was that just me?" */
function at(requestedAt: string): string {
  return new Date(requestedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** When the request came from here, that is reassurance rather than an alarm. */
export function PairingRequestTime({ origin }: { readonly origin: PairingOrigin }) {
  if (origin.origin !== 'this-device') return null

  return (
    <p className="text-muted-foreground">Requested from this device at {at(origin.requestedAt)}</p>
  )
}

/** What the machine will and will not be able to do, spelled out before you agree. */
export function PairingGrants({ grants }: { readonly grants: readonly string[] }) {
  return (
    <section className="flex w-full flex-col gap-2 text-left">
      {/* The account is the subject: the machine could always do these things. */}
      <h2>Your Porte account will be able to</h2>
      <ul className="flex flex-col">
        {grants.map((grant) => (
          // Ruled rows, so each grant is read as its own decision rather than prose.
          <li className="flex items-start gap-2 border-t border-border py-2 last:pb-0" key={grant}>
            <CheckIcon
              aria-hidden
              className="mt-1 size-4 shrink-0 text-status-success-muted-foreground"
            />
            <span>{grant}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The account a decision will be made on behalf of, with its picture. */
export function PairingAccount({
  label,
  image,
}: {
  readonly label: string
  readonly image?: string | null
}) {
  const imageUrl = buildImageProxyUrl('', image ?? null)

  return (
    <p className="flex items-center justify-center gap-2 text-muted-foreground">
      <Avatar className="size-6">
        {imageUrl ? <AvatarImage alt="" src={imageUrl} /> : null}
        <AvatarFallback>{label.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span>
        Signed in as <strong className="text-foreground">{label}</strong>
      </span>
    </p>
  )
}
