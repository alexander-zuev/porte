import type { UseAgentChatOptions } from '@cloudflare/ai-chat/react'
import type {
  ConversationId,
  ConversationIdentity,
  ConversationRelayState,
  ReadyConversationRelayState,
  PendingPermission,
} from '@porte/core/client'
import type { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import { useRelay } from '@web/entities/host/relay-context.tsx'
import { useAgentHeartbeat } from '@web/lib/host/use-agent-heartbeat.ts'
import { useAgent } from 'agents/react'
import type { UIMessage } from 'ai'
import { useMemo, useState } from 'react'

import { useConversationHistory } from './use-conversation-history.ts'

export type ConversationPermission = {
  readonly permission: PendingPermission
  readonly answering: boolean
}

type ConversationAgentClient = ReturnType<
  typeof useAgent<ConversationAgent, ConversationRelayState>
>

/** The ConversationAgent fields that the chat component uses. */
export type ConversationAgentConnection = UseAgentChatOptions<ConversationRelayState>['agent'] &
  Pick<ConversationAgentClient, 'OPEN' | 'readyState'>

/** The complete state that one conversation page can render. */
export type ConversationState =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }
  | {
      readonly status: 'ready'
      readonly identity: ConversationIdentity
      readonly messages: readonly UIMessage[]
      readonly agent: ConversationAgentConnection
      readonly permissions: readonly ConversationPermission[]
      readonly state: ReadyConversationRelayState
      readonly onReadOlder: (() => void) | null
      readonly readingOlder: boolean
      readonly actions: ConversationActions
    }

/** User actions that change the active conversation. */
export type ConversationActions = {
  readonly onAnswerPermission: (waiting: ConversationPermission, optionId: string) => void
}

/** Combines the HTTP transcript with one direct ConversationAgent connection. */
export function useConversation(conversationId: ConversationId): ConversationState {
  const history = useConversationHistory(conversationId)
  const relay = useRelay()
  const agent = useAgent<ConversationAgent, ConversationRelayState>({
    agent: 'HostRelayAgent',
    basePath: 'api/host/ws',
    sub: [{ agent: 'ConversationAgent', name: conversationId }],
  })
  useAgentHeartbeat(agent)
  const [answering, setAnswering] = useState<ReadonlySet<string>>(new Set())
  const initialState = history.status === 'ready' ? history.initial.state : undefined
  const state = agent.state?.status === 'ready' ? agent.state : initialState
  const permissions = useMemo<ConversationPermission[]>(
    () =>
      state?.status === 'ready'
        ? state.pending.permissions.map((permission) => ({
            permission,
            answering: answering.has(permission.permissionId),
          }))
        : [],
    [answering, state],
  )
  const actions = useMemo<ConversationActions>(
    () => ({
      onAnswerPermission: (waiting, optionId) => {
        setAnswering((current) => new Set(current).add(waiting.permission.permissionId))
        void relay.stub
          .answerPermission({
            conversationId,
            turnId: waiting.permission.turnId,
            permissionId: waiting.permission.permissionId,
            optionId,
          })
          .then((response) => {
            if (response.type === 'command.error') {
              setAnswering((current) => without(current, waiting.permission.permissionId))
              return undefined
            }
            return undefined
          })
          .catch(() => {
            setAnswering((current) => without(current, waiting.permission.permissionId))
          })
      },
    }),
    [conversationId, relay.stub],
  )

  if (history.status !== 'ready') return history
  const readyState = state?.status === 'ready' ? state : history.initial.state
  return {
    status: 'ready',
    identity: history.initial.conversation,
    messages: history.messages,
    agent,
    permissions,
    state: readyState,
    onReadOlder: history.onReadOlder,
    readingOlder: history.readingOlder,
    actions,
  }
}

function without(values: ReadonlySet<string>, removed: string): ReadonlySet<string> {
  const next = new Set(values)
  next.delete(removed)
  return next
}
