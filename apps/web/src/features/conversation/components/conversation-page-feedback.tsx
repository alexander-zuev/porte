import { WarningCircleIcon } from '@phosphor-icons/react'
import type { ConversationSummary } from '@porte/core'

import {
  ConversationHeader,
  type ConversationConnection,
} from '#/features/conversation/components/conversation-header.tsx'
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

/** Data required while Porte opens one conversation. */
export type ConversationOpeningProps = {
  readonly conversation: ConversationSummary
  readonly hostName: string
  readonly onBack: () => void
}

/** Render a stable conversation layout while Porte opens the conversation. */
export function ConversationOpening(props: ConversationOpeningProps) {
  return (
    <>
      <ConversationHeader connection="online" {...props} />
      <output aria-label="Opening conversation" className="flex flex-1 flex-col">
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

/** Data and actions for one conversation-open failure. */
export type ConversationFailureProps = {
  readonly conversation: ConversationSummary
  readonly hostName: string
  readonly onBack: () => void
} & (RetryableFailure | OfflineFailure)

/** Render a specific conversation-open failure inside the conversation layout. */
export function ConversationFailure(props: ConversationFailureProps) {
  const content = failureContent(props.reason)
  const connection: ConversationConnection = props.reason === 'host-offline' ? 'offline' : 'online'

  return (
    <>
      <ConversationHeader
        connection={connection}
        hostName={props.hostName}
        conversation={props.conversation}
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
            <Button onClick={props.onBack}>Back to conversations</Button>
          ) : (
            <Button onClick={props.onRetry}>Try again</Button>
          )}
        </EmptyContent>
      </Empty>
    </>
  )
}

function failureContent(reason: ConversationFailureProps['reason']) {
  if (reason === 'unavailable') {
    return {
      title: 'Conversation unavailable',
      description: 'Porte could not find this conversation on the Mac.',
    }
  }
  if (reason === 'agent-failed') {
    return {
      title: 'Grok did not open',
      description: 'The Mac is online, but Grok could not open this conversation.',
    }
  }
  return {
    title: 'Mac is offline',
    description: 'Start Porte on the Mac, then open this conversation again.',
  }
}
