import type { HostSnapshot, SessionSummary } from '@porte/core'

import { SessionGroupList } from './session-group-list.tsx'
import { NoSessions, SessionHomeFailure, SessionHomeLoading } from './session-home-feedback.tsx'
import { SessionHomeHeader } from './session-home-header.tsx'

type SessionListActions = {
  readonly onOpenSession: (sessionId: string) => void
  readonly onStartSession: () => void
  readonly onPair: () => void
  readonly onRetry: () => void
}

export type SessionListProps = SessionListActions &
  (
    | { readonly state: 'loading'; readonly hostName: string }
    | {
        readonly state: 'ready'
        readonly hostName: string
        readonly hostStatus: HostSnapshot['status'] | 'reconnecting'
        readonly sessions: readonly SessionSummary[]
        readonly runningSessionIds: ReadonlySet<string>
        readonly lastSeen?: string
        readonly openingSessionId?: string
        readonly selectedSessionId?: string
      }
    | { readonly state: 'error'; readonly hostName: string }
    | { readonly state: 'unpaired' }
    | { readonly state: 'revoked'; readonly hostName: string }
  )

export function SessionList(props: SessionListProps) {
  if (props.state === 'unpaired' || props.state === 'revoked') {
    return (
      <SessionHomeFailure
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
        <SessionHomeHeader
          canCreate={false}
          hostName={props.hostName}
          hostStatus="loading"
          onStartSession={props.onStartSession}
        />
        <SessionHomeLoading />
      </>
    )
  }
  if (props.state === 'error') {
    return (
      <>
        <SessionHomeHeader
          canCreate={false}
          hostName={props.hostName}
          hostStatus="offline"
          onStartSession={props.onStartSession}
        />
        <SessionHomeFailure
          hostName={props.hostName}
          state="error"
          onPair={props.onPair}
          onRetry={props.onRetry}
        />
      </>
    )
  }

  const canCreate = props.hostStatus === 'online' && props.sessions.length > 0
  return (
    <>
      <SessionHomeHeader
        canCreate={canCreate}
        hostName={props.hostName}
        hostStatus={props.hostStatus}
        statusDetail={
          props.hostStatus === 'offline' && props.lastSeen
            ? `Last seen ${props.lastSeen}`
            : undefined
        }
        onStartSession={props.onStartSession}
      />
      {props.sessions.length === 0 ? (
        <NoSessions canCreate={canCreate} onStartSession={props.onStartSession} />
      ) : (
        <SessionGroupList
          openingSessionId={props.openingSessionId}
          runningSessionIds={props.runningSessionIds}
          selectedSessionId={props.selectedSessionId}
          sessions={props.sessions}
          onOpenSession={props.onOpenSession}
        />
      )}
    </>
  )
}
