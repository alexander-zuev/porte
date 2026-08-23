import { z } from 'zod'

import type { ConversationEvent } from '../conversation/conversation-event.ts'
import type { ConversationStateSnapshot } from '../conversation/conversation-view.ts'
import { ConversationIdSchema, TurnIdSchema } from '../identity/identity.ts'
import type { ActiveConversationTurn } from './protocol.ts'

export const HOST_OPERATION_DELIVERY_DEADLINE_MS = 2 * 60 * 1000
export const HOST_OPERATION_RETENTION_MS = 60 * 60 * 1000

/** Minimal list state for one conversation that owns an active turn. */
export const RelayActiveConversationSchema = z.object({
  conversationId: ConversationIdSchema,
  turnId: TurnIdSchema,
  hasAssistantMessage: z.boolean(),
})

/** Minimal list state for one conversation that owns an active turn. */
export type RelayActiveConversation = z.infer<typeof RelayActiveConversationSchema>

/** Reactive parent Agent state sent to web clients. */
export const HostRelayStateSchema = z.object({
  hostStatus: z.enum(['online', 'offline']),
  catalogRevision: z.number().int().nonnegative(),
  activeConversations: z.array(RelayActiveConversationSchema),
})

/** Reactive parent Agent state sent to web clients. */
export type HostRelayState = z.infer<typeof HostRelayStateSchema>

/** One ordered host fact that can change list activity. */
export type HostRelayActivityInput =
  | { readonly type: 'sync'; readonly activeTurns: readonly ActiveConversationTurn[] }
  | {
      readonly type: 'removed'
      readonly conversationId: z.infer<typeof ConversationIdSchema>
    }
  | {
      readonly type: 'snapshot'
      readonly conversationId: z.infer<typeof ConversationIdSchema>
      readonly snapshot: ConversationStateSnapshot
    }
  | {
      readonly type: 'event'
      readonly conversationId: z.infer<typeof ConversationIdSchema>
      readonly event: ConversationEvent
    }

/** Projects ordered host activity into the smallest state required by the list. */
export function reduceHostRelayActivity(
  state: HostRelayState,
  input: HostRelayActivityInput,
): HostRelayState {
  if (input.type === 'sync') {
    const current = new Map(
      state.activeConversations.map((conversation) => [conversation.conversationId, conversation]),
    )
    return {
      ...state,
      activeConversations: input.activeTurns.map(({ conversationId, turnId }) => {
        const existing = current.get(conversationId)
        return existing?.turnId === turnId
          ? existing
          : { conversationId, turnId, hasAssistantMessage: false }
      }),
    }
  }

  if (input.type === 'snapshot') {
    return input.snapshot.turn.state === 'running'
      ? ensureActiveConversation(state, input.conversationId, input.snapshot.turn.turnId)
      : removeActiveConversation(state, input.conversationId)
  }

  if (input.type === 'removed') return removeActiveConversation(state, input.conversationId)

  switch (input.event.type) {
    case 'turn.started':
      return setActiveConversation(state, input.conversationId, input.event.turnId, false)
    case 'message.started':
      return input.event.role === 'assistant'
        ? markAssistantMessage(state, input.conversationId, input.event.turnId)
        : state
    case 'turn.finished':
      return removeMatchingTurn(state, input.conversationId, input.event.turnId)
    case 'conversation.failed':
      return removeActiveConversation(state, input.conversationId)
    default:
      return state
  }
}

function ensureActiveConversation(
  state: HostRelayState,
  conversationId: z.infer<typeof ConversationIdSchema>,
  turnId: z.infer<typeof TurnIdSchema>,
): HostRelayState {
  return state.activeConversations.some(
    (conversation) =>
      conversation.conversationId === conversationId && conversation.turnId === turnId,
  )
    ? state
    : setActiveConversation(state, conversationId, turnId, false)
}

function setActiveConversation(
  state: HostRelayState,
  conversationId: z.infer<typeof ConversationIdSchema>,
  turnId: z.infer<typeof TurnIdSchema>,
  hasAssistantMessage: boolean,
): HostRelayState {
  return {
    ...state,
    activeConversations: [
      ...state.activeConversations.filter(
        (conversation) => conversation.conversationId !== conversationId,
      ),
      { conversationId, turnId, hasAssistantMessage },
    ],
  }
}

function markAssistantMessage(
  state: HostRelayState,
  conversationId: z.infer<typeof ConversationIdSchema>,
  turnId: z.infer<typeof TurnIdSchema>,
): HostRelayState {
  const current = state.activeConversations.find(
    (conversation) => conversation.conversationId === conversationId,
  )
  if (current !== undefined && current.turnId !== turnId) return state
  return setActiveConversation(state, conversationId, turnId, true)
}

function removeMatchingTurn(
  state: HostRelayState,
  conversationId: z.infer<typeof ConversationIdSchema>,
  turnId: z.infer<typeof TurnIdSchema>,
): HostRelayState {
  return state.activeConversations.some(
    (conversation) =>
      conversation.conversationId === conversationId && conversation.turnId === turnId,
  )
    ? removeActiveConversation(state, conversationId)
    : state
}

function removeActiveConversation(
  state: HostRelayState,
  conversationId: z.infer<typeof ConversationIdSchema>,
): HostRelayState {
  const activeConversations = state.activeConversations.filter(
    (conversation) => conversation.conversationId !== conversationId,
  )
  return activeConversations.length === state.activeConversations.length
    ? state
    : { ...state, activeConversations }
}
