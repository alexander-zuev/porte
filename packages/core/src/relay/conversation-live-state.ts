import type { ConversationConfigurationOption } from '../conversation/conversation-controls-event.ts'
import type { ConversationEvent } from '../conversation/conversation-event.ts'
import type {
  ConversationPlan,
  ConversationUsage,
} from '../conversation/conversation-progress-event.ts'
import type { ConversationState, PendingInteractions } from '../conversation/conversation-view.ts'
import { notYetImplemented } from '../errors/defects.ts'
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
  /** The Mac's running turn. Durable, so a restarted relay knows a turn may still run. */
  readonly runningTurnId?: TurnId
  readonly usage?: ConversationUsage
  readonly configuration?: readonly ConversationConfigurationOption[]
  readonly modeId?: string
}

/** The state before the Host has said anything. */
export const INITIAL_CONVERSATION_LIVE_STATE: ConversationLiveState = {
  plans: [],
  pending: { permissions: [], elicitations: [] },
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
  // TODO(step 1): fold turn, pending, plans, usage, configuration, mode; return `current` on a no-op.
  void event
  void current
  return notYetImplemented('step 1')
}

/**
 * The live state one complete Host state implies.
 *
 * @param state - The Host's `conversation.get` result.
 * @returns The live facts, without commands.
 */
export function liveStateFromConversation(state: ConversationState): ConversationLiveState {
  // TODO(step 1): select plans, pending, running turn, usage, configuration, mode.
  void state
  return notYetImplemented('step 1')
}
