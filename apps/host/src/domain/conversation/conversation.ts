import {
  applyConversationEvent,
  emptyConversationView,
} from '@host/domain/conversation/conversation-view-reducer.ts'
import { Entity } from '@host/domain/entity.ts'
import { createEvent } from '@host/domain/messages/types.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  type AttemptId,
  type CanonicalContent,
  ConversationBusyError,
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
  type ToolView,
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
  /** A prompt this Host sent that Grok has not echoed yet. Host-only. */
  readonly pendingAttempt?: PendingAttempt
  /** The relay's key for the latest turn this Host started; a repeated `turn.start` is a no-op. */
  readonly lastAttempt?: { readonly attemptId: AttemptId; readonly turnId: TurnId }
  /** When a turn last started or ended here; idle eviction reads it. Host-only. */
  readonly lastActivityAt: IsoDateTime
}

type PendingAttempt = {
  readonly attemptId: AttemptId
  /** The first text block; Grok's echo is matched on it. */
  readonly firstText: string
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

/** What `requestTurn` decided about one attempt. */
export type TurnRequest =
  | { readonly type: 'sent' }
  /** The same attempt already produced this turn; nothing to send. */
  | { readonly type: 'repeated'; readonly turnId: TurnId }
  /** The same attempt is already waiting for its echo. */
  | { readonly type: 'pending' }

/**
 * One coding conversation open on this process.
 *
 * Grok owns the turns: every `turn.started` and `turn.finished` arrives from its
 * stream, whoever typed the prompt. This aggregate keeps the transcript, the
 * live turn, and the one Host-only fact Grok cannot know: which attempt from
 * the relay a turn answers. Every transition raises the canonical
 * `ConversationEvent` the relay consumes and folds it into `state`.
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
      // SAFETY: same RFC 3339 UTC string as `updatedAt`.
      lastActivityAt: input.now.toISOString() as IsoDateTime,
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
      lastActivityAt: input.updatedAt,
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

  /**
   * Fold the agent's history into the transcript without raising. Turn
   * boundaries fold too: a history whose last turn has not finished leaves the
   * conversation `running`, and the live stream continues that turn.
   */
  replay(events: readonly ConversationEvent[]): void {
    if (this.data.state.turn.state !== 'idle') throw new ConversationBusyError()
    for (const event of events) {
      if (event.type === 'turn.started') this.startTurn(event.turnId, event.attemptId, event)
      else if (event.type === 'turn.finished') this.endTurn(event.turnId, event.outcome, event)
      else this.fold(event)
    }
  }

  /**
   * Record that this Host is sending `userMessage` as `attemptId`. The turn it
   * starts is learned from Grok's echo, which `applyAgentEvents` binds to the
   * attempt. Another turn running is `ConversationBusyError`: the relay queues.
   */
  requestTurn(attemptId: AttemptId, userMessage: UserMessage): TurnRequest {
    if (this.data.lastAttempt?.attemptId === attemptId) {
      return { type: 'repeated', turnId: this.data.lastAttempt.turnId }
    }
    if (this.data.pendingAttempt?.attemptId === attemptId) return { type: 'pending' }
    if (this.data.state.turn.state === 'running' || this.data.pendingAttempt !== undefined) {
      throw new ConversationBusyError()
    }
    this.data = {
      ...this.data,
      pendingAttempt: { attemptId, firstText: firstText(userMessage.content) },
    }
    return { type: 'sent' }
  }

  /** Grok refused the pending prompt before any turn started; nothing to bind any more. */
  dropPendingAttempt(attemptId: AttemptId): void {
    if (this.data.pendingAttempt?.attemptId !== attemptId) return
    const { pendingAttempt: _dropped, ...rest } = this.data
    this.data = rest
  }

  /** The attempt still waiting for Grok's echo, if any. */
  get pendingAttemptId(): AttemptId | undefined {
    return this.data.pendingAttempt?.attemptId
  }

  /** The running turn when `attemptId` started it; undefined for a foreign or finished turn. */
  runningTurnFor(attemptId: AttemptId): TurnId | undefined {
    const turn = this.data.state.turn
    if (turn.state !== 'running' || turn.attemptId !== attemptId) return undefined
    return turn.turnId
  }

  /** Record activity for idle eviction. */
  touch(now: IsoDateTime): void {
    this.data = { ...this.data, lastActivityAt: now }
  }

  get lastActivityAt(): IsoDateTime {
    return this.data.lastActivityAt
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
   * Grok ends it with a `cancelled` outcome. A turn that is not running is a
   * no-op: cancel and the natural end may race, and both outcomes are final.
   */
  cancelTurn(turnId: TurnId): void {
    const turn = this.data.state.turn
    if (turn.state !== 'running' || turn.turnId !== turnId) return
    this.cancelPending(turnId)
  }

  /** One turn's slice of the transcript, for `turn.get`. */
  turnTranscript(turnId: TurnId): ConversationTurn {
    const items = this.data.state.items.filter((item) => item.turnId === turnId)
    if (items.length === 0) throw new TurnNotFoundError()
    const toolCallIds = new Set(
      items.flatMap((item) => (item.type === 'tool' ? [item.toolCallId] : [])),
    )
    const tools = this.data.state.tools.filter((tool) => toolCallIds.has(tool.toolCallId))
    const last = this.data.lastAttempt
    const slice: ConversationTurn =
      last?.turnId === turnId
        ? { turnId, attemptId: last.attemptId, items, tools }
        : { turnId, items, tools }
    return structuredClone(slice)
  }

  /**
   * End the turn here, without Grok: the cancel deadline passed. Grok's own
   * `turn.finished` for it, if it ever comes, is late and dropped. A turn that
   * already ended is a no-op.
   */
  finishTurn(turnId: TurnId, outcome: TurnOutcome): void {
    const turn = this.data.state.turn
    if (turn.state !== 'running' || turn.turnId !== turnId) return
    this.endTurn(turnId, outcome, undefined)
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
   * Record one batch of events Grok's stream produced.
   *
   * `turn.started` opens the turn. Its attempt id becomes the pending attempt's
   * when the echoed user text in the same batch matches; otherwise the stream's
   * own id stays, and the turn is one another client typed. `turn.finished`
   * closes it. Turn-scoped events for any other turn are late and dropped: after
   * a cancel deadline Grok may keep talking about a turn this Host has ended.
   */
  applyAgentEvents(events: readonly ConversationEvent[]): void {
    const echoedText = firstEchoedText(events)
    for (const event of events) {
      if (event.type === 'conversation.metadata.updated') {
        this.applyMetadata(event.update)
        continue
      }
      if (event.type === 'turn.started') {
        const bound = this.bindAttempt(echoedText)
        this.startTurn(event.turnId, bound ?? event.attemptId, undefined)
        // Only a turn this Host asked for is a repeatable attempt; a foreign one is not ours to retry.
        if (bound !== undefined) {
          this.data = { ...this.data, lastAttempt: { attemptId: bound, turnId: event.turnId } }
        }
        continue
      }
      if (event.type === 'turn.finished') {
        if (this.isRunning(event.turnId)) this.endTurn(event.turnId, event.outcome, undefined)
        continue
      }
      if ('turnId' in event) {
        if (!this.isRunning(event.turnId)) continue
        this.raise(event)
        if (event.type === 'tool.updated') this.settleAnsweredElsewhere(event.turnId, event.tool)
        continue
      }
      this.raise(event)
    }
  }

  private startTurn(
    turnId: TurnId,
    attemptId: AttemptId,
    replayed: ConversationEvent | undefined,
  ): void {
    if (this.data.state.turn.state === 'running') throw new ConversationBusyError()
    this.data = {
      ...this.data,
      state: { ...this.data.state, turn: { state: 'running', turnId, attemptId } },
    }
    const event: ConversationEvent = { type: 'turn.started', turnId, attemptId }
    if (replayed === undefined) this.raise(event)
    else this.fold(event)
  }

  private endTurn(
    turnId: TurnId,
    outcome: TurnOutcome,
    replayed: ConversationEvent | undefined,
  ): void {
    if (replayed === undefined) this.cancelPending(turnId)
    this.data.state.turn = { state: 'idle' }
    const event: ConversationEvent = { type: 'turn.finished', turnId, outcome }
    if (replayed === undefined) this.raise(event)
    else this.fold(event)
  }

  /**
   * The pending attempt's id when the echo can be its prompt. A text echo must
   * match the prompt's first text block; an echo that opens with a file, or
   * with nothing readable, gets the benefit of the doubt, because Grok queues
   * prompts in order and this Host has one in flight.
   */
  private bindAttempt(echoedText: string | undefined): AttemptId | undefined {
    const pending = this.data.pendingAttempt
    if (pending === undefined) return undefined
    if (echoedText !== undefined && echoedText !== pending.firstText) return undefined
    const { pendingAttempt: _bound, ...rest } = this.data
    this.data = rest
    return pending.attemptId
  }

  /**
   * A tool that moved past `pending` while its permission was still parked was
   * allowed by another client of the shared session. The card goes without a
   * decision here.
   */
  private settleAnsweredElsewhere(turnId: TurnId, tool: ToolView): void {
    if (tool.status === 'pending') return
    for (const permission of this.data.state.pending.permissions) {
      if (permission.turnId !== turnId || permission.toolCallId !== tool.toolCallId) continue
      this.raise({
        type: 'permission.resolved',
        turnId,
        permissionId: permission.permissionId,
        outcome: { type: 'answered-elsewhere' },
      })
    }
  }

  private raise(event: ConversationEvent): void {
    this.fold(event)
    this.addEvent(createEvent('ConversationEventRaised', { conversationId: this.data.id, event }))
  }

  private fold(event: ConversationEvent): void {
    applyConversationEvent(this.data.state, event)
  }

  private isRunning(turnId: TurnId): boolean {
    const turn = this.data.state.turn
    return turn.state === 'running' && turn.turnId === turnId
  }

  private runningTurnId(): TurnId {
    const turn = this.data.state.turn
    if (turn.state !== 'running') throw new TurnNotFoundError()
    return turn.turnId
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

/** The first text block of a prompt; the key Grok's echo is matched on. */
function firstText(content: readonly CanonicalContent[]): string {
  const text = content.find((block) => block.type === 'text')
  return text === undefined ? '' : text.text
}

/** The first user text delta in one batch, when the batch echoes a prompt. */
function firstEchoedText(events: readonly ConversationEvent[]): string | undefined {
  const started = events.find((event) => event.type === 'message.started' && event.role === 'user')
  if (started?.type !== 'message.started') return undefined
  const delta = events.find(
    (event) => event.type === 'message.delta' && event.messageId === started.messageId,
  )
  if (delta?.type !== 'message.delta') return undefined
  return delta.content.type === 'text' ? delta.content.text : undefined
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
