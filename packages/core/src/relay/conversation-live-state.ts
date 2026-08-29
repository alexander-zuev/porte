import type { ConversationConfigurationOption } from '../conversation/conversation-controls-event.ts'
import type { ConversationEvent } from '../conversation/conversation-event.ts'
import type {
  ConversationPlan,
  ConversationUsage,
} from '../conversation/conversation-progress-event.ts'
import type { ConversationState, PendingInteractions } from '../conversation/conversation-view.ts'
import type { TurnId } from '../identity/identity.ts'

/**
 * The live facts beside the transcript: what the browser shows that is not a message.
 *
 * Small on purpose. The SDK writes and broadcasts the whole value on every
 * `setState`, so `commands` (about 100 KB) lives in DO storage and reaches the
 * browser through the `listCommands` callable. No schema: both ends ship in one
 * deploy and the events this is built from were parsed at the JSON-RPC boundary.
 */
export type ConversationLiveState = {
  readonly plans: readonly ConversationPlan[]
  readonly pending: PendingInteractions
  /** The machine's running turn. Durable, so a restarted relay knows a turn may still run. */
  readonly runningTurnId?: TurnId
  readonly usage?: ConversationUsage
  readonly configuration?: readonly ConversationConfigurationOption[]
  readonly modeId?: string
}

const NO_PENDING: PendingInteractions = { permissions: [], elicitations: [] }

/** The state before the Host has said anything. */
export const INITIAL_CONVERSATION_LIVE_STATE: ConversationLiveState = {
  plans: [],
  pending: NO_PENDING,
}

/**
 * Apply one ordered Host event.
 *
 * Returns `current` itself when the event changes nothing, so the caller can
 * skip `setState` by reference and the SDK does not rewrite and broadcast the
 * state for every delta.
 *
 * @param current - The state before the event.
 * @param event - One canonical conversation event.
 * @returns The next state, or `current` unchanged.
 */
export function reduceLiveState(
  current: ConversationLiveState,
  event: ConversationEvent,
): ConversationLiveState {
  switch (event.type) {
    case 'turn.started':
      return { ...current, runningTurnId: event.turnId }
    case 'turn.finished':
    case 'conversation.failed': {
      const { runningTurnId: _ended, ...rest } = current
      return { ...rest, pending: NO_PENDING }
    }
    case 'permission.requested':
      return {
        ...current,
        pending: {
          ...current.pending,
          permissions: [
            ...current.pending.permissions.filter(
              (permission) => permission.permissionId !== event.permissionId,
            ),
            event,
          ],
        },
      }
    case 'permission.resolved':
      return {
        ...current,
        pending: {
          ...current.pending,
          permissions: current.pending.permissions.filter(
            (permission) => permission.permissionId !== event.permissionId,
          ),
        },
      }
    case 'elicitation.requested':
      return {
        ...current,
        pending: {
          ...current.pending,
          elicitations: [
            ...current.pending.elicitations.filter(
              (elicitation) => elicitation.elicitationId !== event.elicitationId,
            ),
            event,
          ],
        },
      }
    case 'elicitation.resolved':
    case 'elicitation.completed':
      return {
        ...current,
        pending: {
          ...current.pending,
          elicitations: current.pending.elicitations.filter(
            (elicitation) => elicitation.elicitationId !== event.elicitationId,
          ),
        },
      }
    case 'plan.updated':
      return {
        ...current,
        plans: [...current.plans.filter((plan) => plan.planId !== event.plan.planId), event.plan],
      }
    case 'plan.removed':
      return { ...current, plans: current.plans.filter((plan) => plan.planId !== event.planId) }
    case 'conversation.usage.updated':
      return { ...current, usage: event.usage }
    case 'conversation.configuration.updated':
      return { ...current, configuration: event.options }
    case 'conversation.mode.updated':
      return { ...current, modeId: event.modeId }
    // The transcript belongs to AIChatAgent and the command list to DO storage.
    case 'conversation.commands.updated':
    case 'message.started':
    case 'message.delta':
    case 'message.completed':
    case 'reasoning.started':
    case 'reasoning.delta':
    case 'reasoning.completed':
    case 'tool.updated':
    case 'conversation.metadata.updated':
      return current
  }
  const exhaustive: never = event
  return exhaustive
}

/**
 * The live state one complete Host state implies.
 *
 * @param state - The Host's `conversation.get` result.
 * @returns The live facts, without the transcript or commands.
 */
export function liveStateFromConversation(state: ConversationState): ConversationLiveState {
  const facts = { plans: state.plans, pending: state.pending }
  const running =
    state.turn.state === 'running' ? { ...facts, runningTurnId: state.turn.turnId } : facts
  const withUsage = state.usage === undefined ? running : { ...running, usage: state.usage }
  const withConfiguration =
    state.configuration === undefined
      ? withUsage
      : { ...withUsage, configuration: state.configuration }
  return state.modeId === undefined
    ? withConfiguration
    : { ...withConfiguration, modeId: state.modeId }
}
