import type {
  CanonicalContent,
  ConversationCursor,
  ConversationEvent,
  ConversationId,
  ElicitationAnswer,
  ElicitationId,
  HostControlMethodMap,
  IsoDateTime,
  PendingElicitation,
  PendingPermission,
  PermissionId,
} from '@porte/core/client'

/**
 * Port for the coding agent process (Grok now).
 *
 * The agent owns every turn. Whoever typed the prompt, this surface or the
 * terminal, the turn reaches the application as canonical events through
 * `AgentListener`: `turn.started`, the user echo, the answer, `turn.finished`.
 * Conversation state lives in the `Conversation` aggregate, not here.
 */
export type SessionFacts = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly title: string
  readonly updatedAt: IsoDateTime
}

export type SessionPage = {
  readonly sessions: readonly SessionFacts[]
  readonly next?: ConversationCursor
}

export type CreateSession = HostControlMethodMap['conversation.create']['params']

/** A session the agent created plus the events that describe its initial controls. */
export type CreatedSession = {
  readonly id: ConversationId
  readonly events: readonly ConversationEvent[]
}

/**
 * A loaded session: its title as the agent lists it, and its history as events,
 * turn boundaries included. A history whose last turn has no `turn.finished` is
 * still running on the agent; the live stream continues it.
 */
export type LoadedSession = {
  readonly title: string
  readonly events: readonly ConversationEvent[]
}

export type PermissionRequest = Omit<PendingPermission, 'turnId'>
export type ElicitationRequest = Omit<PendingElicitation, 'turnId'>
export type PermissionOutcome = Extract<
  ConversationEvent,
  { type: 'permission.resolved' }
>['outcome']

/** The model select the host advertises; `conversation.model.set` writes it. */
export const MODEL_OPTION_ID = 'model'

/** The current model's effort select; written together with the model, never alone. */
export const EFFORT_OPTION_ID = 'effort'

/** What the agent pushes while a session is open. The application wires it to the bus. */
export interface AgentListener {
  onEvents(conversationId: ConversationId, events: readonly ConversationEvent[]): void
  /** The agent waits on `resolvePermission` for this id. */
  onPermissionRequest(conversationId: ConversationId, request: PermissionRequest): void
  /** The agent waits on `resolveElicitation` for this id. */
  onElicitationRequest(conversationId: ConversationId, request: ElicitationRequest): void
  onElicitationComplete(conversationId: ConversationId, elicitationId: ElicitationId): void
}

export interface CodingAgent {
  listSessions(cursor?: ConversationCursor): Promise<SessionPage>
  createSession(input: CreateSession): Promise<CreatedSession>
  /** Replay the session history; the caller folds `events` with `Conversation.replay`. */
  loadSession(id: ConversationId, cwd: string): Promise<LoadedSession>
  /** Whether this process holds the session; a closed one must be loaded before `prompt`. */
  isOpen(id: ConversationId): boolean
  /**
   * Hand the agent a prompt. The turn it starts, and its end, arrive as events;
   * this resolves when the agent has answered the prompt request, and rejects
   * only when the agent refused to run it.
   */
  prompt(id: ConversationId, content: readonly CanonicalContent[]): Promise<void>
  /** Cooperative: the running turn ends with a `cancelled` outcome on the stream. */
  cancel(id: ConversationId): Promise<void>
  setModel(
    id: ConversationId,
    modelId: string,
    reasoningEffort?: string,
  ): Promise<readonly ConversationEvent[]>
  /**
   * Forget the session on this process. Never closes it on the agent: the
   * session is shared with the terminal, and closing there would end it for both.
   */
  closeSession(id: ConversationId): Promise<void>
  /** No-op when nothing is parked under that id; the aggregate is the validator. */
  resolvePermission(permissionId: PermissionId, outcome: PermissionOutcome): void
  /** No-op when nothing is parked under that id. */
  resolveElicitation(elicitationId: ElicitationId, answer: ElicitationAnswer): void
  /** Cancels every parked request and stops the process. */
  stop(): Promise<void>
}
