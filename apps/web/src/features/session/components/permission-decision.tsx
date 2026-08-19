import { ShieldCheckIcon, WarningCircleIcon } from '@phosphor-icons/react'

import type { PermissionDecision as PermissionDecisionState } from '#/entities/session/session-control.ts'
import type { SessionConnection } from '#/features/session/components/session-header.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/ui/components/ui/card.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

/** Props for one persistent permission decision. */
export type PermissionDecisionProps = {
  readonly connection: SessionConnection
  readonly decision: PermissionDecisionState
  readonly onAnswer: (optionId: string) => void
  readonly onRetry: () => void
  readonly onStop: () => void
}

/** Render all permission response states with equal option priority. */
export function PermissionDecision(props: PermissionDecisionProps) {
  const { decision } = props
  const pending = decision.state === 'pending'

  return (
    <Card className="mx-4 mb-3 gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon />
          {decision.request.title}
        </CardTitle>
        <CardDescription>Grok needs your permission before it can continue.</CardDescription>
      </CardHeader>
      <CardContent>
        {pending ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {decision.request.options.map((option) => (
              <Button
                className="h-auto min-h-11 whitespace-normal"
                disabled={props.connection !== 'online'}
                key={option.optionId}
                variant="outline"
                onClick={() => {
                  props.onAnswer(option.optionId)
                }}
              >
                {option.name}
              </Button>
            ))}
          </div>
        ) : (
          <PermissionResponse decision={decision} onRetry={props.onRetry} />
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Separator />
        <Button
          className="min-h-11 self-start"
          disabled={decision.state === 'submitting'}
          variant="destructive"
          onClick={props.onStop}
        >
          Stop turn
        </Button>
      </CardFooter>
    </Card>
  )
}

function PermissionResponse({
  decision,
  onRetry,
}: Pick<PermissionDecisionProps, 'decision' | 'onRetry'>) {
  if (decision.state === 'submitting') {
    return <Status title="Sending decision" icon={<Spinner />} />
  }
  if (decision.state === 'failed') {
    return (
      <Status title="Decision was not sent" icon={<WarningCircleIcon />}>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </Status>
    )
  }
  if (decision.state === 'delivery-unknown') {
    return (
      <Status title="Delivery status is unknown" icon={<WarningCircleIcon />}>
        Porte will check the current permission state after reconnection.
      </Status>
    )
  }
  if (decision.state === 'resolved') return <ResolvedDecision decision={decision} />
  if (decision.state === 'cancelled') return <Status title="Permission cancelled" />
  if (decision.state === 'resolved-elsewhere') {
    return <Status title="Permission resolved on another device" />
  }
  return null
}

function ResolvedDecision({
  decision,
}: {
  readonly decision: Extract<PermissionDecisionState, { state: 'resolved' }>
}) {
  const option = decision.request.options.find((item) => item.optionId === decision.optionId)
  if (option === undefined) return <Status title="Permission resolved" />
  const approved = option.kind === 'allow_once' || option.kind === 'allow_always'
  return <Status title={approved ? 'Permission approved' : 'Permission denied'}>{option.name}</Status>
}

function Status({
  title,
  icon,
  children,
}: {
  readonly title: string
  readonly icon?: React.ReactNode
  readonly children?: React.ReactNode
}) {
  return (
    <Alert>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  )
}
