import type { UseAgentChatOptions } from '@cloudflare/ai-chat/react'
import type {
  ConversationId,
  ConversationRelayState,
  ReadyConversationRelayState,
  PendingPermission,
} from '@porte/core/client'
import type { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import { useAgent } from 'agents/react'
import { useMemo, useState } from 'react'

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
  | {
      readonly status: 'ready'
      readonly agent: ConversationAgentConnection
      readonly permissions: readonly ConversationPermission[]
      readonly state: ReadyConversationRelayState
      readonly actions: ConversationActions
    }

/** User actions that change the active conversation. */
export type ConversationActions = {
  readonly onAnswerPermission: (waiting: ConversationPermission, optionId: string) => void
}

/** Connects one page directly to its ConversationAgent. */
export function useConversation(conversationId: ConversationId): ConversationState {
  const agent = useAgent<ConversationAgent, ConversationRelayState>({
    agent: 'HostRelayAgent',
    basePath: 'api/host/ws',
    sub: [{ agent: 'ConversationAgent', name: conversationId }],
  })
  const [answering, setAnswering] = useState<ReadonlySet<string>>(new Set())
  const state = agent.state?.status === 'ready' ? agent.state : undefined
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
        void agent.stub
          .answerPermission({
            turnId: waiting.permission.turnId,
            permissionId: waiting.permission.permissionId,
            optionId,
          })
          .catch(() => {
            setAnswering((current) => without(current, waiting.permission.permissionId))
          })
      },
    }),
    [agent.stub],
  )

  if (state === undefined) return { status: 'pending' }
  return {
    status: 'ready',
    agent,
    permissions,
    state,
    actions,
  }
}

function without(values: ReadonlySet<string>, removed: string): ReadonlySet<string> {
  const next = new Set(values)
  next.delete(removed)
  return next
}
