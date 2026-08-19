import { WarningCircleIcon } from '@phosphor-icons/react'
import type { SessionSummary } from '@porte/core'

import {
  SessionHeader,
  type SessionConnection,
} from '#/features/session/components/session-header.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/ui/components/ui/empty.tsx'
import { Skeleton } from '#/ui/components/ui/skeleton.tsx'

/** Data required while Porte opens one session. */
export type SessionOpeningProps = {
  readonly session: SessionSummary
  readonly hostName: string
  readonly onBack: () => void
}

/** Render a stable session layout while Porte opens the session. */
export function SessionOpening(props: SessionOpeningProps) {
  return (
    <>
      <SessionHeader connection="online" {...props} />
      <output aria-label="Opening session" className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-6 px-5 py-8">
          <Skeleton className="h-20 w-4/5" />
          <Skeleton className="ml-auto h-28 w-4/5" />
          <Skeleton className="h-16 w-3/5" />
        </div>
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Skeleton className="h-28 w-full" />
        </div>
      </output>
    </>
  )
}

type RetryableFailure = {
  readonly reason: 'unavailable' | 'agent-failed'
  readonly onRetry: () => void
}

type OfflineFailure = {
  readonly reason: 'host-offline'
}

/** Data and actions for one session-open failure. */
export type SessionFailureProps = {
  readonly session: SessionSummary
  readonly hostName: string
  readonly onBack: () => void
} & (RetryableFailure | OfflineFailure)

/** Render a specific session-open failure inside the session layout. */
export function SessionFailure(props: SessionFailureProps) {
  const content = failureContent(props.reason)
  const connection: SessionConnection = props.reason === 'host-offline' ? 'offline' : 'online'

  return (
    <>
      <SessionHeader
        connection={connection}
        hostName={props.hostName}
        session={props.session}
        onBack={props.onBack}
      />
      <Empty className="flex-1 border-0 px-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WarningCircleIcon />
          </EmptyMedia>
          <EmptyTitle>{content.title}</EmptyTitle>
          <EmptyDescription>{content.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {props.reason === 'host-offline' ? (
            <Button onClick={props.onBack}>Back to sessions</Button>
          ) : (
            <Button onClick={props.onRetry}>Try again</Button>
          )}
        </EmptyContent>
      </Empty>
    </>
  )
}

function failureContent(reason: SessionFailureProps['reason']) {
  if (reason === 'unavailable') {
    return {
      title: 'Session unavailable',
      description: 'Porte could not find this session on the Mac.',
    }
  }
  if (reason === 'agent-failed') {
    return {
      title: 'Grok did not open',
      description: 'The Mac is online, but Grok could not open this session.',
    }
  }
  return {
    title: 'Mac is offline',
    description: 'Start Porte on the Mac, then open this session again.',
  }
}
