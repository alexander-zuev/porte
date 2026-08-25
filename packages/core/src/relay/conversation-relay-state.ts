import { z } from 'zod'

import type { ConversationEvent } from '../conversation/conversation-event.ts'
import {
  ConversationStateSchema,
  type ConversationState,
} from '../conversation/conversation-view.ts'

const ReadyConversationRelayStateSchema = ConversationStateSchema.extend({
  status: z.literal('ready'),
})

/** Durable child state sent to browser connections. */
export const ConversationRelayStateSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('uninitialized') }),
  ReadyConversationRelayStateSchema,
])

/** Durable child state sent to browser connections. */
export type ConversationRelayState = z.infer<typeof ConversationRelayStateSchema>
export type ReadyConversationRelayState = z.infer<typeof ReadyConversationRelayStateSchema>

export const INITIAL_CONVERSATION_RELAY_STATE: ConversationRelayState = {
  status: 'uninitialized',
}

const EMPTY_STATE: ConversationState = {
  turn: { state: 'idle' },
  items: [],
  tools: [],
  plans: [],
  pending: { permissions: [], elicitations: [] },
}

/** Apply one ordered Host event to durable child state. */
export function reduceConversationRelayState(
  current: ConversationRelayState,
  event: ConversationEvent,
): ConversationRelayState {
  const source = current.status === 'ready' ? current : { status: 'ready' as const, ...EMPTY_STATE }
  const state = structuredClone(source)

  switch (event.type) {
    case 'turn.started':
      state.turn = { state: 'running', turnId: event.turnId }
      break
    case 'turn.finished':
    case 'conversation.failed':
      state.turn = { state: 'idle' }
      state.pending = { permissions: [], elicitations: [] }
      break
    case 'message.started':
      if (!hasItem(state, event.messageId)) {
        state.items.push({
          type: 'message',
          messageId: event.messageId,
          role: event.role,
          content: [],
        })
      }
      break
    case 'reasoning.started':
      if (!hasItem(state, event.messageId)) {
        state.items.push({ type: 'reasoning', messageId: event.messageId, content: [] })
      }
      break
    case 'message.delta':
      appendContent(state, event.messageId, 'message', event.content)
      break
    case 'reasoning.delta':
      appendContent(state, event.messageId, 'reasoning', event.content)
      break
    case 'tool.updated': {
      const index = state.tools.findIndex((tool) => tool.toolCallId === event.tool.toolCallId)
      if (index === -1) {
        state.tools.push(event.tool)
        state.items.push({ type: 'tool', toolCallId: event.tool.toolCallId })
      } else {
        state.tools[index] = event.tool
      }
      break
    }
    case 'permission.requested':
      state.pending.permissions = [
        ...state.pending.permissions.filter(
          (permission) => permission.permissionId !== event.permissionId,
        ),
        event,
      ]
      break
    case 'permission.resolved':
      state.pending.permissions = state.pending.permissions.filter(
        (permission) => permission.permissionId !== event.permissionId,
      )
      break
    case 'elicitation.requested':
      state.pending.elicitations = [
        ...state.pending.elicitations.filter(
          (elicitation) => elicitation.elicitationId !== event.elicitationId,
        ),
        event,
      ]
      break
    case 'elicitation.resolved':
    case 'elicitation.completed':
      state.pending.elicitations = state.pending.elicitations.filter(
        (elicitation) => elicitation.elicitationId !== event.elicitationId,
      )
      break
    case 'plan.updated':
      state.plans = [...state.plans.filter((plan) => plan.planId !== event.plan.planId), event.plan]
      break
    case 'plan.removed':
      state.plans = state.plans.filter((plan) => plan.planId !== event.planId)
      break
    case 'conversation.usage.updated':
      state.usage = event.usage
      break
    case 'conversation.configuration.updated':
      state.configuration = [...event.options]
      break
    case 'conversation.commands.updated':
      state.commands = [...event.commands]
      break
    case 'conversation.mode.updated':
      state.modeId = event.modeId
      break
    case 'message.completed':
    case 'reasoning.completed':
    case 'conversation.metadata.updated':
      break
  }

  return ConversationRelayStateSchema.parse(state)
}

/** Convert one complete Host state into durable child state. */
export function conversationRelayStateFromState(
  state: ConversationState,
): ReadyConversationRelayState {
  return ReadyConversationRelayStateSchema.parse({ status: 'ready', ...state })
}

function hasItem(state: ConversationState, messageId: string): boolean {
  return state.items.some((item) => item.type !== 'tool' && item.messageId === messageId)
}

function appendContent(
  state: ConversationState,
  messageId: string,
  type: 'message' | 'reasoning',
  content: Extract<ConversationEvent, { type: 'message.delta' }>['content'],
): void {
  const item = state.items.find(
    (current) => current.type !== 'tool' && current.messageId === messageId,
  )
  if (item?.type === type) item.content.push(content)
}
