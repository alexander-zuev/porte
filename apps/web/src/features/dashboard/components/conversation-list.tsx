import type { HostSnapshot, ConversationSummary } from '@porte/core'

import { ConversationGroupList } from './conversation-group-list.tsx'
import {
  NoConversations,
  ConversationHomeFailure,
  ConversationHomeLoading,
} from './conversation-home-feedback.tsx'
import { ConversationHomeHeader } from './conversation-home-header.tsx'

type ConversationListActions = {
  readonly onOpenConversation: (conversationId: string) => void
  readonly onStartConversation: () => void
  readonly onPair: () => void
  readonly onRetry: () => void
}

export type ConversationListProps = ConversationListActions &
  (
    | { readonly state: 'loading'; readonly hostName: string }
    | {
        readonly state: 'ready'
        readonly hostName: string
        readonly hostStatus: HostSnapshot['status'] | 'reconnecting'
        readonly conversations: readonly ConversationSummary[]
        readonly runningConversationIds: ReadonlySet<string>
        readonly lastSeen?: string
        readonly openingConversationId?: string
        readonly selectedConversationId?: string
      }
    | { readonly state: 'error'; readonly hostName: string }
    | { readonly state: 'unpaired' }
    | { readonly state: 'revoked'; readonly hostName: string }
  )

export function ConversationList(props: ConversationListProps) {
  if (props.state === 'unpaired' || props.state === 'revoked') {
    return (
      <ConversationHomeFailure
        hostName={props.state === 'revoked' ? props.hostName : undefined}
        state={props.state}
        onPair={props.onPair}
        onRetry={props.onRetry}
      />
    )
  }
  if (props.state === 'loading') {
    return (
      <>
        <ConversationHomeHeader
          canCreate={false}
          hostName={props.hostName}
          hostStatus="loading"
          onStartConversation={props.onStartConversation}
        />
        <ConversationHomeLoading />
      </>
    )
  }
  if (props.state === 'error') {
    return (
      <>
        <ConversationHomeHeader
          canCreate={false}
          hostName={props.hostName}
          hostStatus="offline"
          onStartConversation={props.onStartConversation}
        />
        <ConversationHomeFailure
          hostName={props.hostName}
          state="error"
          onPair={props.onPair}
          onRetry={props.onRetry}
        />
      </>
    )
  }

  const canCreate = props.hostStatus === 'online' && props.conversations.length > 0
  return (
    <>
      <ConversationHomeHeader
        canCreate={canCreate}
        hostName={props.hostName}
        hostStatus={props.hostStatus}
        statusDetail={
          props.hostStatus === 'offline' && props.lastSeen
            ? `Last seen ${props.lastSeen}`
            : undefined
        }
        onStartConversation={props.onStartConversation}
      />
      {props.conversations.length === 0 ? (
        <NoConversations canCreate={canCreate} onStartConversation={props.onStartConversation} />
      ) : (
        <ConversationGroupList
          openingConversationId={props.openingConversationId}
          runningConversationIds={props.runningConversationIds}
          selectedConversationId={props.selectedConversationId}
          conversations={props.conversations}
          onOpenConversation={props.onOpenConversation}
        />
      )}
    </>
  )
}
