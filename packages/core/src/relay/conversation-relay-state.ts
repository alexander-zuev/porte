import { z } from 'zod'

import type { ConversationEvent } from '../conversation/conversation-event.ts'
import {
  ConversationStateSnapshotSchema,
  type ConversationStateSnapshot,
} from '../conversation/conversation-view.ts'

const ReadyConversationRelayStateSchema = ConversationStateSnapshotSchema.extend({
  status: z.literal('ready'),
})

/** Client state that is not part of the AI SDK message transcript. */
export const ConversationRelayStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('uninitialized') }),
  ReadyConversationRelayStateSchema,
])

/** Client state that is not part of the AI SDK message transcript. */
export type ConversationRelayState = z.infer<typeof ConversationRelayStateSchema>
export type ReadyConversationRelayState = z.infer<typeof ReadyConversationRelayStateSchema>

export const INITIAL_CONVERSATION_RELAY_STATE: ConversationRelayState = {
  status: 'uninitialized',
}

const EMPTY_READY_STATE: ReadyConversationRelayState = {
  status: 'ready',
  turn: { state: 'idle' },
  pending: { permissions: [], elicitations: [] },
  plans: [],
  usage: null,
  configuration: null,
  commands: null,
  modeId: null,
}

/** Applies one canonical event to the client state outside the transcript. */
export function reduceConversationRelayState(
  current: ConversationRelayState,
  event: ConversationEvent,
): ConversationRelayState {
  const state = current.status === 'ready' ? current : EMPTY_READY_STATE
  switch (event.type) {
    case 'turn.started':
      return { ...state, turn: { state: 'running', turnId: event.turnId } }
    case 'turn.finished':
    case 'conversation.failed':
      return { ...state, turn: { state: 'idle' } }
    case 'permission.requested':
      return {
        ...state,
        pending: {
          ...state.pending,
          permissions: [
            ...state.pending.permissions.filter(
              (permission) => permission.permissionId !== event.permissionId,
            ),
            event,
          ],
        },
      }
    case 'permission.resolved':
      return {
        ...state,
        pending: {
          ...state.pending,
          permissions: state.pending.permissions.filter(
            (permission) => permission.permissionId !== event.permissionId,
          ),
        },
      }
    case 'elicitation.requested':
      return {
        ...state,
        pending: {
          ...state.pending,
          elicitations: [
            ...state.pending.elicitations.filter(
              (elicitation) => elicitation.elicitationId !== event.elicitationId,
            ),
            event,
          ],
        },
      }
    case 'elicitation.resolved':
    case 'elicitation.completed':
      return {
        ...state,
        pending: {
          ...state.pending,
          elicitations: state.pending.elicitations.filter(
            (elicitation) => elicitation.elicitationId !== event.elicitationId,
          ),
        },
      }
    case 'plan.updated':
      return {
        ...state,
        plans: [...state.plans.filter((plan) => plan.planId !== event.plan.planId), event.plan],
      }
    case 'plan.removed':
      return { ...state, plans: state.plans.filter((plan) => plan.planId !== event.planId) }
    case 'conversation.usage.updated':
      return { ...state, usage: event.usage }
    case 'conversation.configuration.updated':
      return { ...state, configuration: event.options }
    case 'conversation.commands.updated':
      return { ...state, commands: event.commands }
    case 'conversation.mode.updated':
      return { ...state, modeId: event.modeId }
    default:
      return current
  }
}

/** Converts one provider snapshot to the child Agent state. */
export function conversationRelayStateFromSnapshot(
  snapshot: ConversationStateSnapshot,
): ReadyConversationRelayState {
  const parsed = ConversationStateSnapshotSchema.parse(snapshot)
  return { status: 'ready', ...parsed }
}
