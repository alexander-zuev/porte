import {
  applyConversationEvent,
  emptyConversationView,
} from '@host/domain/conversation/conversation-view-reducer.ts'
import { Entity } from '@host/domain/entity.ts'
import { createEvent } from '@host/domain/messages/types.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  type AttemptId,
  ConversationBusyError,
  notYetImplemented,
  type CanonicalContent,
  type ConversationEvent,
  type ConversationId,
  type ConversationMetadataPatch,
  type ConversationState,
  type ConversationTurn,
  type ConversationTurnState,
  type ElicitationAnswer,
  type ElicitationId,
  ElicitationNotFoundError,
  type IsoDateTime,
  type MessageId,
  type PendingElicitation,
  type PendingPermission,
  type PermissionId,
  PermissionNotFoundError,
  type TurnId,
  TurnNotFoundError,
} from '@porte/core/client'

export type TurnOutcome = Extract<ConversationEvent, { type: 'turn.finished' }>['outcome']

export type ConversationData = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly title: string
  readonly updatedAt: IsoDateTime
  /** Live turn plus the transcript, exactly what `conversation.get` returns. */
  readonly state: ConversationState
  /** The relay's key for the latest turn, so a repeated `turn.start` is a no-op. Host-only. */
  readonly lastAttempt?: { readonly attemptId: AttemptId; readonly turnId: TurnId }
}

/** Input to start one conversation in a git workspace. */
export type CreateConversationInput = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly now: Date
}

/** Input to restore one conversation that already exists on the coding agent. */
export type RestoreConversationInput = {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly title: string
  readonly updatedAt: IsoDateTime
}

export type UserMessage = {
  readonly id: MessageId
  readonly content: readonly CanonicalContent[]
}

/**
 * One coding conversation open on this process.
 *
 * Owns the live turn and the transcript. Every transition raises the canonical
 * `ConversationEvent` the relay consumes, folds it into `state`, and wraps it as
 * `ConversationEventRaised`. The coding agent stays the system of record; `replay`
 * rebuilds `state` from its history without raising.
 */
export class Conversation extends Entity<ConversationData> {
  private constructor(private data: ConversationData) {
    super()
  }

  /** Start an empty conversation in a git workspace. */
  static create(input: CreateConversationInput): Conversation {
    return new Conversation({
      id: input.id,
      cwd: input.cwd,
      gitRoot: normaliseGitRoot(input.gitRoot),
      title: '',
      // SAFETY: Date#toISOString is RFC 3339 UTC, which IsoDateTime requires.
      updatedAt: input.now.toISOString() as IsoDateTime,
      state: { turn: { state: 'idle' }, ...emptyConversationView() },
    })
  }

  /** Rebuild one conversation from coding-agent facts. Raises nothing. */
  static restore(input: RestoreConversationInput): Conversation {
    return new Conversation({
      id: input.id,
      cwd: input.cwd,
      gitRoot: normaliseGitRoot(input.gitRoot),
      title: input.title,
      updatedAt: input.updatedAt,
      state: { turn: { state: 'idle' }, ...emptyConversationView() },
    })
  }

  get id(): ConversationId {
    return this.data.id
  }

  get cwd(): string {
    return this.data.cwd
  }

  get gitRoot(): string {
    return this.data.gitRoot
  }

  get title(): string {
    return this.data.title
  }

  get updatedAt(): IsoDateTime {
    return this.data.updatedAt
  }

  get turn(): ConversationTurnState {
    return this.data.state.turn
  }

  /** A copy; later transitions do not change it. */
  snapshot(): ConversationState {
    return structuredClone(this.data.state)
  }

  toPlainObject(): ConversationData {
    return this.data
  }

  /** Fold the agent's history into the transcript without raising. Idle only. */
  replay(events: readonly ConversationEvent[]): void {
    if (this.data.state.turn.state !== 'idle') throw new ConversationBusyError()
    for (const event of events) this.fold(event)
  }

  /**
   * Start a turn with the user's message and return the turn id this aggregate minted.
   *
   * The id is `turnIdFor(id, promptIndex)`, with `promptIndex` predicted as the
   * count of user messages so far; the mapper checks it against Grok's own. A
   * repeated `attemptId`, running or the last finished one, returns the same
   * turn and starts nothing. Another turn running is `ConversationBusyError`.
   */
  beginTurn(attemptId: AttemptId, userMessage: UserMessage): TurnId {
    // TODO(step 2): dedupe on `lastAttempt`, mint the id, raise turn.started with attemptId and the user message as `${turnId}:user`.
    void attemptId
    void userMessage
    return notYetImplemented('step 2')
  }

  /** Park a permission request on the running turn. */
  requestPermission(request: Omit<PendingPermission, 'turnId'>): void {
    const turnId = this.runningTurnId()
    this.raise({ type: 'permission.requested', turnId, ...request })
  }

  answerPermission(turnId: TurnId, permissionId: PermissionId, optionId: string): void {
    const pending = this.data.state.pending.permissions.find(
      (permission) => permission.turnId === turnId && permission.permissionId === permissionId,
    )
    if (pending === undefined || !pending.options.some((option) => option.optionId === optionId)) {
      throw new PermissionNotFoundError()
    }
    this.raise({
      type: 'permission.resolved',
      turnId,
      permissionId,
      outcome: { type: 'selected', optionId },
    })
  }

  /** Park an elicitation on the running turn. */
  requestElicitation(request: Omit<PendingElicitation, 'turnId'>): void {
    const turnId = this.runningTurnId()
    this.raise({ type: 'elicitation.requested', turnId, ...request })
  }

  answerElicitation(turnId: TurnId, elicitationId: ElicitationId, answer: ElicitationAnswer): void {
    const pending = this.data.state.pending.elicitations.find(
      (elicitation) => elicitation.turnId === turnId && elicitation.elicitationId === elicitationId,
    )
    if (pending === undefined) throw new ElicitationNotFoundError()
    this.raise({
      type: 'elicitation.resolved',
      turnId,
      elicitationId,
      outcome: elicitationOutcome(answer),
    })
  }

  /** The agent reports a URL elicitation finished after the user accepted it. */
  completeElicitation(elicitationId: ElicitationId): void {
    const turnId = this.runningTurnId()
    this.raise({ type: 'elicitation.completed', turnId, elicitationId })
  }

  /**
   * Resolve every pending interaction as cancelled. The turn stays running until
   * the agent answers the prompt with `cancelled`. A turn that is not running is
   * a no-op: cancel and the natural end may race, and both outcomes are final.
   */
  cancelTurn(turnId: TurnId): void {
    // TODO(step 2): return when `turn` is idle or names another turn; keep `cancelPending` for the running one.
    this.requireTurn(turnId)
    this.cancelPending(turnId)
  }

  /** One turn's slice of the transcript, for `turn.get`. */
  turnTranscript(turnId: TurnId): ConversationTurn {
    // TODO(step 2): items and tools whose `turnId` matches; `TurnNotFoundError` when none.
    void turnId
    return notYetImplemented('step 2')
  }

  /** End the turn. A turn that already ended is a no-op. */
  finishTurn(turnId: TurnId, outcome: TurnOutcome): void {
    const turn = this.data.state.turn
    if (turn.state !== 'running' || turn.turnId !== turnId) return
    this.cancelPending(turnId)
    this.data.state.turn = { state: 'idle' }
    this.raise({ type: 'turn.finished', turnId, outcome })
  }

  /** Leave this process: pending interactions resolve as cancelled, the socket can go. */
  close(): void {
    const turn = this.data.state.turn
    if (turn.state === 'running') this.cancelPending(turn.turnId)
    this.addEvent(createEvent('ConversationClosed', { conversationId: this.data.id }))
  }

  applyMetadata(update: ConversationMetadataPatch): void {
    this.data = {
      ...this.data,
      title: update.title === undefined ? this.data.title : (update.title ?? ''),
      updatedAt: update.updatedAt ?? this.data.updatedAt,
    }
    this.raise({ type: 'conversation.metadata.updated', update })
  }

  /**
   * Record events the coding agent produced during the live turn. Turn-scoped
   * events need the running turn; metadata folds into the aggregate too.
   */
  applyAgentEvents(events: readonly ConversationEvent[]): void {
    for (const event of events) {
      if (event.type === 'conversation.metadata.updated') {
        this.applyMetadata(event.update)
        continue
      }
      if ('turnId' in event) this.requireTurn(event.turnId)
      this.raise(event)
    }
  }

  private raise(event: ConversationEvent): void {
    this.fold(event)
    this.addEvent(createEvent('ConversationEventRaised', { conversationId: this.data.id, event }))
  }

  private fold(event: ConversationEvent): void {
    applyConversationEvent(this.data.state, event)
  }

  private runningTurnId(): TurnId {
    const turn = this.data.state.turn
    if (turn.state !== 'running') throw new TurnNotFoundError()
    return turn.turnId
  }

  private requireTurn(turnId: TurnId): void {
    if (this.runningTurnId() !== turnId) throw new TurnNotFoundError()
  }

  private cancelPending(turnId: TurnId): void {
    const { permissions, elicitations } = this.data.state.pending
    for (const { permissionId } of permissions) {
      this.raise({
        type: 'permission.resolved',
        turnId,
        permissionId,
        outcome: { type: 'cancelled' },
      })
    }
    for (const { elicitationId } of elicitations) {
      this.raise({
        type: 'elicitation.resolved',
        turnId,
        elicitationId,
        outcome: { type: 'cancelled' },
      })
    }
  }
}

function elicitationOutcome(
  answer: ElicitationAnswer,
): Extract<ConversationEvent, { type: 'elicitation.resolved' }>['outcome'] {
  switch (answer.type) {
    case 'submit':
      return { type: 'submitted', values: answer.values }
    case 'accept':
      return { type: 'accepted' }
    case 'decline':
      return { type: 'declined' }
    case 'cancel':
      return { type: 'cancelled' }
  }
}
