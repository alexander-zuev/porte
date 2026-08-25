import type {
  ConversationCommand,
  ConversationConfigurationOption,
} from '../conversation/conversation-controls-event.ts'
import type { ConversationEvent } from '../conversation/conversation-event.ts'
import type {
  ConversationPlan,
  ConversationUsage,
} from '../conversation/conversation-progress-event.ts'
import type { ConversationState, PendingInteractions } from '../conversation/conversation-view.ts'

/**
 * What the browser cannot get from the Agents SDK.
 *
 * The transcript, its ordering, and whether a turn runs all belong to
 * AIChatAgent: `messages` carries the first two and `isServerStreaming` the
 * third. Only Grok's own reporting lives here.
 *
 * No schema: both ends ship in one deploy, and the events this is built from
 * are already parsed at the JSON-RPC boundary.
 */
export type ConversationRelayState = {
  plans: readonly ConversationPlan[]
  pending: PendingInteractions
  usage?: ConversationUsage
  configuration?: readonly ConversationConfigurationOption[]
  commands?: readonly ConversationCommand[]
  modeId?: string
}

export const INITIAL_CONVERSATION_RELAY_STATE: ConversationRelayState = {
  plans: [],
  pending: { permissions: [], elicitations: [] },
}

/** Apply one ordered Host event to durable child state. */
export function reduceConversationRelayState(
  current: ConversationRelayState,
  event: ConversationEvent,
): ConversationRelayState {
  const state = structuredClone(current)

  switch (event.type) {
    case 'turn.finished':
    case 'conversation.failed':
      state.pending = { permissions: [], elicitations: [] }
      break
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
    case 'turn.started':
    case 'message.started':
    case 'message.delta':
    case 'message.completed':
    case 'reasoning.started':
    case 'reasoning.delta':
    case 'reasoning.completed':
    case 'tool.updated':
    case 'conversation.metadata.updated':
      break
  }

  return state
}

/** Select the Grok-only fields from one complete Host state. */
export function conversationRelayStateFromState(state: ConversationState): ConversationRelayState {
  return {
    plans: state.plans,
    pending: state.pending,
    usage: state.usage,
    configuration: state.configuration,
    commands: state.commands,
    modeId: state.modeId,
  }
}
