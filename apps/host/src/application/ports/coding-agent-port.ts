import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import type {
  CanonicalContent,
  ConversationCursor,
  ConversationEvent,
  ConversationId,
  ConversationUsage,
  ElicitationAnswer,
  ElicitationId,
  HostControlMethodMap,
  IsoDateTime,
  PendingElicitation,
  PendingPermission,
  PermissionId,
  TurnId,
} from '@porte/core/client'

/**
 * Port for the coding agent process (Grok now). Replaces `coding-agent.ts` in
 * commit 6 of the redesign; both exist until the switch.
 *
 * Every method maps to one agent request. Mutations return the canonical events
 * they cause; what the agent pushes on its own reaches the application through
 * `AgentListener`. Conversation state lives in the `Conversation` aggregate, not here.
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

export type PromptResult = {
  readonly outcome: TurnOutcome
  readonly usage?: ConversationUsage
}

export type PermissionRequest = Omit<PendingPermission, 'turnId'>
export type ElicitationRequest = Omit<PendingElicitation, 'turnId'>
export type PermissionOutcome = Extract<
  ConversationEvent,
  { type: 'permission.resolved' }
>['outcome']

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
  /** Replay the session history as events; the caller folds them with `Conversation.replay`. */
  loadSession(id: ConversationId, cwd: string): Promise<readonly ConversationEvent[]>
  /** Resolves when the turn ends. Rejects only when the agent could not run it. */
  prompt(
    id: ConversationId,
    turnId: TurnId,
    content: readonly CanonicalContent[],
  ): Promise<PromptResult>
  /** Cooperative: the in-flight `prompt` resolves with a `cancelled` outcome. */
  cancel(id: ConversationId): Promise<void>
  setModel(id: ConversationId, modelId: string): Promise<readonly ConversationEvent[]>
  /** No-op for a session this process does not hold. */
  closeSession(id: ConversationId): Promise<void>
  /** @throws PermissionNotFoundError */
  resolvePermission(permissionId: PermissionId, outcome: PermissionOutcome): void
  /** @throws ElicitationNotFoundError */
  resolveElicitation(elicitationId: ElicitationId, answer: ElicitationAnswer): void
  /** Cancels every parked request and stops the process. */
  stop(): Promise<void>
}
