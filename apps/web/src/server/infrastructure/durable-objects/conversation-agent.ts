import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import {
  ConversationIdSchema,
  EventSequenceSchema,
  INITIAL_CONVERSATION_RELAY_STATE,
  MessageIdSchema,
  TurnIdSchema,
  conversationRelayStateFromSnapshot,
  createLogger,
  createTurnId,
  reduceConversationRelayState,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
  turnCancelOperationId,
  turnStartOperationId,
  type CanonicalContent,
  type ConversationEvent,
  type ConversationId,
  type ConversationRelayState,
  type ConversationStateSnapshot,
  type EventSequence,
  type PorteErrorPayload,
  type MessageId,
  type TurnId,
} from '@porte/core'
import { toErrorPayload } from '@server/infrastructure/errors/to-error-payload.ts'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import {
  ConversationEventProjector,
  type ConversationEventProjectionState,
} from '@web/lib/conversation/conversation-event-projector.ts'
import type { AgentContext } from 'agents'
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type GenerateTextOnFinishCallback,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'

// oxlint-disable-next-line import/no-cycle -- The Agents SDK resolves the runtime parent class.
import { HostRelayAgent } from './host-relay-agent.ts'

const logger = createLogger('conversation-agent')

const EVENT_PREFIX = 'conversation-event:'
const EVENT_HEAD_KEY = 'conversation-event-head'
const ACTIVE_TURN_KEY = 'active-turn'
const EVENT_RETENTION_MS = 60 * 60 * 1_000
const EVENT_CLEANUP_CALLBACK = 'cleanupConversationEvents'

type ActiveTurn = {
  readonly turnId: TurnId
  readonly userMessage: {
    readonly id: ReturnType<typeof MessageIdSchema.parse>
    readonly content: CanonicalContent[]
  }
  readonly projection: ProjectionSnapshot
}

type ProjectionSnapshot = {
  readonly toolInputSignatures: readonly (readonly [string, string])[]
  readonly ownMessages: readonly string[]
  readonly openText: readonly string[]
  readonly openReasoning: readonly string[]
}

type ConversationEventRecord =
  | {
      readonly status: 'pending'
      readonly eventSequence: EventSequence
      readonly event: ConversationEvent
      readonly acceptedAt: number
    }
  | {
      readonly status: 'accepted'
      readonly eventSequence: EventSequence
      readonly event: ConversationEvent
      readonly acceptedAt: number
    }

type ConversationSnapshotRecord = {
  readonly status: 'accepted'
  readonly eventSequence: EventSequence
  readonly snapshot: ConversationStateSnapshot
  readonly acceptedAt: number
}

type ConversationStreamRecord = ConversationEventRecord | ConversationSnapshotRecord

type ActiveStream = {
  readonly turn: ActiveTurn
  readonly writer: WritableStreamDefaultWriter<UIMessageChunk>
  readonly projection: ConversationEventProjectionState
}

/** One child chat Agent for one conversation on a Mac host. */
export class ConversationAgent extends AIChatAgent<RuntimeEnv, ConversationRelayState> {
  initialState: ConversationRelayState = INITIAL_CONVERSATION_RELAY_STATE
  chatRecovery = true

  private readonly conversationId: ConversationId
  private readonly projector: ConversationEventProjector
  private activeStream: ActiveStream | undefined
  private streamWork: Promise<void> = Promise.resolve()

  /** Creates the isolated chat state and pure event projector. */
  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(RELAY_HEARTBEAT_REQUEST, RELAY_HEARTBEAT_RESPONSE),
    )
    this.conversationId = ConversationIdSchema.parse(this.name)
    this.projector = new ConversationEventProjector()
  }

  /** Starts a Mac turn or reconnects SDK recovery to the current Mac turn. */
  override async onChatMessage(
    _onFinish: GenerateTextOnFinishCallback,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    const storedTurn = await this.ctx.storage.get<ActiveTurn>(ACTIVE_TURN_KEY)
    const userMessage = latestUserMessage(this.messages)
    if (userMessage === undefined && !(options?.continuation && storedTurn !== undefined)) {
      return errorStreamResponse('Enter a prompt or attach a file.')
    }
    if (options?.continuation && storedTurn === undefined) {
      return errorStreamResponse('The turn is no longer available for recovery.')
    }
    if (!options?.continuation && storedTurn !== undefined) {
      return errorStreamResponse('A turn is already running.')
    }

    const turn =
      storedTurn ??
      createActiveTurn(
        options?.requestId === undefined ? createTurnId() : TurnIdSchema.parse(options.requestId),
        userMessage!,
      )
    const stream = new TransformStream<UIMessageChunk, UIMessageChunk>()
    const writer = stream.writable.getWriter()
    const active = {
      turn,
      writer,
      projection: restoreProjection(turn.projection),
    } satisfies ActiveStream
    this.activeStream = active

    if (storedTurn === undefined || storedTurn.turnId !== turn.turnId) {
      await this.ctx.storage.put(ACTIVE_TURN_KEY, turn)
    }
    const abort = (): void => {
      this.detachActiveStream(active)
      this.cancelTurnInBackground(turn)
    }
    if (options?.abortSignal?.aborted) abort()
    else options?.abortSignal?.addEventListener('abort', abort, { once: true })
    void this.resumeTurn(active)

    return createUIMessageStreamResponse({ stream: stream.readable })
  }

  /** Accepts one validated Mac event before the parent sends its acknowledgment. */
  async acceptHostEvent(
    eventSequence: EventSequence,
    event: ConversationEvent,
  ): Promise<EventSequence> {
    return await this.serializeStreamWork(() => this.acceptHostEventSerial(eventSequence, event))
  }

  /** Stores and projects one event while no other stream record can interleave. */
  private async acceptHostEventSerial(
    eventSequence: EventSequence,
    event: ConversationEvent,
  ): Promise<EventSequence> {
    const eventHead = await this.ctx.storage.get<EventSequence>(EVENT_HEAD_KEY)
    if (eventHead !== undefined && eventSequence <= eventHead) return eventHead
    const key = eventKey(eventSequence)
    const stored = await this.ctx.storage.get<ConversationStreamRecord>(key)
    if (stored?.status === 'accepted') return await this.advanceEventHead()

    const acceptedAt = stored?.acceptedAt ?? Date.now()
    const acceptedEvent = stored !== undefined && 'event' in stored ? stored.event : event
    if (stored === undefined) {
      await this.ctx.storage.put(key, {
        status: 'pending',
        eventSequence,
        event: acceptedEvent,
        acceptedAt,
      })
    }

    this.applyConversationEvent(acceptedEvent)
    const active = this.activeStream
    if (active !== undefined && eventBelongsToTurn(acceptedEvent, active.turn.turnId)) {
      await this.drainPendingEvents(active)
    } else {
      const storedTurn = await this.ctx.storage.get<ActiveTurn>(ACTIVE_TURN_KEY)
      if (storedTurn === undefined || !eventBelongsToTurn(acceptedEvent, storedTurn.turnId)) {
        await this.ctx.storage.put(key, {
          status: 'accepted',
          eventSequence,
          event: acceptedEvent,
          acceptedAt,
        })
      }
    }

    await this.ensureEventCleanupSchedule(acceptedAt + EVENT_RETENTION_MS)
    return await this.advanceEventHead()
  }

  /** Accepts one state snapshot before the parent sends its acknowledgment. */
  async acceptHostSnapshot(
    eventSequence: EventSequence,
    snapshot: ConversationStateSnapshot,
  ): Promise<EventSequence> {
    return await this.serializeStreamWork(() =>
      this.acceptHostSnapshotSerial(eventSequence, snapshot),
    )
  }

  /** Stores one state checkpoint while no event can interleave. */
  private async acceptHostSnapshotSerial(
    eventSequence: EventSequence,
    snapshot: ConversationStateSnapshot,
  ): Promise<EventSequence> {
    const eventHead = await this.ctx.storage.get<EventSequence>(EVENT_HEAD_KEY)
    if (eventHead !== undefined && eventSequence <= eventHead) return eventHead
    const key = eventKey(eventSequence)
    const stored = await this.ctx.storage.get<ConversationStreamRecord>(key)
    if (stored === undefined) {
      const acceptedAt = Date.now()
      await this.ctx.storage.put(key, {
        status: 'accepted',
        eventSequence,
        snapshot,
        acceptedAt,
      } satisfies ConversationSnapshotRecord)
      this.setState(conversationRelayStateFromSnapshot(snapshot))
      await this.ensureEventCleanupSchedule(acceptedAt + EVENT_RETENTION_MS)
    }
    return await this.advanceEventHead()
  }

  /** Parent RPC: seeds conversation state before the browser connects. */
  async initializeConversation(snapshot: ConversationStateSnapshot): Promise<void> {
    this.setState(conversationRelayStateFromSnapshot(snapshot))
  }

  /** Parent recovery flow: returns the durable host stream position. */
  async acceptedEventHead(): Promise<EventSequence | undefined> {
    return await this.ctx.storage.get<EventSequence>(EVENT_HEAD_KEY)
  }

  /** Parent recovery flow: removes a turn that the current host process lost. */
  async reconcileHostTurn(turnId: TurnId | null): Promise<void> {
    await this.serializeStreamWork(async () => {
      const stored = await this.ctx.storage.get<ActiveTurn>(ACTIVE_TURN_KEY)
      if (stored === undefined || stored.turnId === turnId) return

      const active = this.activeStream
      if (active?.turn.turnId === stored.turnId) {
        this.activeStream = undefined
        await closeWriterWithError(active.writer, 'The Mac host stopped before the turn finished.')
      }
      await this.ctx.storage.delete(ACTIVE_TURN_KEY)
      if (this.state.status === 'ready') {
        this.setState({
          ...this.state,
          turn: { state: 'idle' },
          pending: { permissions: [], elicitations: [] },
        })
      }
    })
  }

  /** Restores pending events and repeats the same idempotent start command. */
  private async resumeTurn(active: ActiveStream): Promise<void> {
    try {
      if (this.activeStream !== active) return
      await this.serializeStreamWork(() => this.drainPendingEvents(active))
      if (this.activeStream !== active) return

      const parent = await this.parentAgent(HostRelayAgent)
      const response = await parent.startTurn({
        operationId: turnStartOperationId(this.conversationId, active.turn.turnId),
        params: {
          conversationId: this.conversationId,
          turnId: active.turn.turnId,
          userMessage: active.turn.userMessage,
        },
      })
      if (!response.success && !keepsTurnPending(response.error)) {
        await this.closeActiveStreamWithError(active, response.error.message)
      }
    } catch (error) {
      logger.error('turn_resume_failed', {
        error,
        details: { conversationId: this.conversationId, turnId: active.turn.turnId },
      })
      await this.closeRecoverableStreamWithError(active, 'The conversation stream failed.')
    }
  }

  /** Closes only the stream that still owns the active turn. */
  private async closeActiveStreamWithError(active: ActiveStream, message: string): Promise<void> {
    if (this.activeStream !== active) return
    this.activeStream = undefined
    await closeWriterWithError(active.writer, message)
    await this.ctx.storage.delete(ACTIVE_TURN_KEY)
  }

  /** Closes a failed response but keeps the operation for the next chat recovery request. */
  private async closeRecoverableStreamWithError(
    active: ActiveStream,
    message: string,
  ): Promise<void> {
    if (this.activeStream !== active) return
    this.activeStream = undefined
    await closeWriterWithError(active.writer, message)
  }

  /** Detaches a browser stream without deleting the durable Mac turn. */
  private detachActiveStream(active: ActiveStream): void {
    if (this.activeStream !== active) return
    this.activeStream = undefined
    void active.writer.close().catch(() => undefined)
  }

  private cancelTurnInBackground(turn: ActiveTurn): void {
    void this.cancelTurn(turn).catch((error) => {
      logger.error('turn_cancel_failed', {
        error,
        details: { conversationId: this.conversationId, turnId: turn.turnId },
      })
    })
  }

  /** Stores cancellation in the parent ledger before it removes the child turn. */
  private async cancelTurn(turn: ActiveTurn): Promise<void> {
    const parent = await this.parentAgent(HostRelayAgent)
    const cancelled = await parent.cancelTurn({
      operationId: turnCancelOperationId(this.conversationId, turn.turnId),
      params: { conversationId: this.conversationId, turnId: turn.turnId },
    })
    // A refusal arrives as a value now, so it is logged here rather than by the caller's catch.
    if (!cancelled.success) {
      logger.error('turn_cancel_failed', {
        details: {
          conversationId: this.conversationId,
          turnId: turn.turnId,
          tag: cancelled.error._tag,
        },
      })
      return
    }

    await this.serializeStreamWork(async () => {
      const stored = await this.ctx.storage.get<ActiveTurn>(ACTIVE_TURN_KEY)
      if (stored?.turnId !== turn.turnId) return

      await this.ctx.storage.delete(ACTIVE_TURN_KEY)
      await this.acceptPendingTurnEvents(turn.turnId)
    })
  }

  /** Accepts pending events after their active turn is canceled. */
  private async acceptPendingTurnEvents(turnId: TurnId): Promise<void> {
    const records = await this.ctx.storage.list<ConversationStreamRecord>({
      prefix: EVENT_PREFIX,
    })
    await Promise.all(
      [...records.entries()].flatMap(([key, record]) =>
        'event' in record && record.status === 'pending' && eventBelongsToTurn(record.event, turnId)
          ? [this.ctx.storage.put(key, { ...record, status: 'accepted' })]
          : [],
      ),
    )
  }

  /** Serializes stream storage and projection across interleaved Agent RPC calls. */
  private serializeStreamWork<Result>(work: () => Promise<Result>): Promise<Result> {
    const result = this.streamWork.then(work, work)
    this.streamWork = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private applyConversationEvent(event: ConversationEvent): void {
    const state = reduceConversationRelayState(this.state, event)
    if (state !== this.state) this.setState(state)
  }

  /** Advances the durable acknowledgment only through a contiguous sequence. */
  private async advanceEventHead(): Promise<EventSequence> {
    const storedHead = await this.ctx.storage.get<EventSequence>(EVENT_HEAD_KEY)
    const records = await this.ctx.storage.list<ConversationStreamRecord>({ prefix: EVENT_PREFIX })
    const sequences = new Set([...records.values()].map((record) => record.eventSequence))
    let head = storedHead ?? Math.min(...sequences) - 1
    while (sequences.has(EventSequenceSchema.parse(head + 1))) head += 1
    const eventSequence = EventSequenceSchema.parse(head)
    if (eventSequence !== storedHead) await this.ctx.storage.put(EVENT_HEAD_KEY, eventSequence)
    return eventSequence
  }

  /** Projects each durable event that belongs to the active Mac turn. */
  private async drainPendingEvents(active: ActiveStream): Promise<void> {
    const records = await this.ctx.storage.list<ConversationStreamRecord>({ prefix: EVENT_PREFIX })
    for (const [key, record] of records) {
      if (this.activeStream !== active) return
      if (
        !('event' in record) ||
        record.status !== 'pending' ||
        !eventBelongsToTurn(record.event, active.turn.turnId)
      ) {
        continue
      }
      // oxlint-disable-next-line no-await-in-loop -- Projection and storage must preserve host order.
      if (await this.acceptPendingEvent(key, record, active)) return
    }
  }

  /** Projects and accepts one event before the next host event can advance. */
  private async acceptPendingEvent(
    key: string,
    record: Extract<ConversationEventRecord, { status: 'pending' }>,
    active: ActiveStream,
  ): Promise<boolean> {
    try {
      await writeChunks(active.writer, this.projector.project(record.event, active.projection))
    } catch (error) {
      logger.warn('conversation_stream_detached', {
        error: toErrorPayload(error),
        details: { conversationId: this.conversationId, turnId: active.turn.turnId },
      })
      this.detachActiveStream(active)
      return true
    }
    await this.ctx.storage.put(ACTIVE_TURN_KEY, {
      ...active.turn,
      projection: snapshotProjection(active.projection),
    } satisfies ActiveTurn)
    await this.ctx.storage.put(key, {
      status: 'accepted',
      eventSequence: record.eventSequence,
      event: record.event,
      acceptedAt: record.acceptedAt,
    })
    if (!isTerminalEvent(record.event)) return false

    this.activeStream = undefined
    await active.writer.close().catch(() => undefined)
    await this.ctx.storage.delete(ACTIVE_TURN_KEY)
    return true
  }

  /** Keeps active-turn events and deletes old duplicate markers. */
  async cleanupConversationEvents(): Promise<void> {
    const now = Date.now()
    const activeTurn = await this.ctx.storage.get<ActiveTurn>(ACTIVE_TURN_KEY)
    const records = await this.ctx.storage.list<ConversationStreamRecord>({ prefix: EVENT_PREFIX })
    const expired: string[] = []
    const accepted: Array<
      readonly [string, Extract<ConversationEventRecord, { status: 'pending' }>]
    > = []
    let nextCleanupAt: number | undefined
    for (const [key, record] of records) {
      if ('event' in record && record.status === 'pending') {
        if (activeTurn !== undefined && eventBelongsToTurn(record.event, activeTurn.turnId)) {
          nextCleanupAt = earlier(nextCleanupAt, now + EVENT_RETENTION_MS)
          continue
        }
        if (record.acceptedAt + EVENT_RETENTION_MS <= now) expired.push(key)
        else {
          accepted.push([key, record])
          nextCleanupAt = earlier(nextCleanupAt, record.acceptedAt + EVENT_RETENTION_MS)
        }
      } else if (record.acceptedAt + EVENT_RETENTION_MS <= now) {
        expired.push(key)
      } else {
        nextCleanupAt = earlier(nextCleanupAt, record.acceptedAt + EVENT_RETENTION_MS)
      }
    }
    await Promise.all(
      accepted.map(([key, record]) => this.ctx.storage.put(key, { ...record, status: 'accepted' })),
    )
    if (expired.length > 0) await this.ctx.storage.delete(expired)
    await this.replaceEventCleanupSchedule(nextCleanupAt)
  }

  /** Keeps one cleanup schedule at the earliest accepted event expiry. */
  private async replaceEventCleanupSchedule(nextCleanupAt: number | undefined): Promise<void> {
    const schedules = await this.listSchedules()
    await Promise.all(
      schedules
        .filter((schedule) => schedule.callback === EVENT_CLEANUP_CALLBACK)
        .map((schedule) => this.cancelSchedule(schedule.id)),
    )
    if (nextCleanupAt !== undefined) {
      await this.schedule(
        new Date(Math.max(nextCleanupAt, Date.now() + 1_000)),
        EVENT_CLEANUP_CALLBACK,
        undefined,
        { idempotent: true },
      )
    }
  }

  /** Keeps an existing earlier cleanup or schedules this event expiry. */
  private async ensureEventCleanupSchedule(cleanupAt: number): Promise<void> {
    const schedules = await this.listSchedules()
    const cleanupSchedules = schedules.filter(
      (schedule) => schedule.callback === EVENT_CLEANUP_CALLBACK,
    )
    if (cleanupSchedules.some((schedule) => schedule.time * 1_000 <= cleanupAt)) return

    await Promise.all(cleanupSchedules.map((schedule) => this.cancelSchedule(schedule.id)))
    await this.schedule(new Date(cleanupAt), EVENT_CLEANUP_CALLBACK, undefined, {
      idempotent: true,
    })
  }
}

function createActiveTurn(
  turnId: TurnId,
  userMessage: { readonly id: MessageId; readonly content: CanonicalContent[] },
): ActiveTurn {
  return {
    turnId,
    userMessage,
    projection: emptyProjection(),
  }
}

function emptyProjection(): ProjectionSnapshot {
  return { toolInputSignatures: [], ownMessages: [], openText: [], openReasoning: [] }
}

function restoreProjection(snapshot: ProjectionSnapshot): ConversationEventProjectionState {
  return {
    toolInputSignatures: new Map(snapshot.toolInputSignatures),
    ownMessages: new Set(snapshot.ownMessages),
    openText: new Set(snapshot.openText),
    openReasoning: new Set(snapshot.openReasoning),
  }
}

function snapshotProjection(state: ConversationEventProjectionState): ProjectionSnapshot {
  return {
    toolInputSignatures: [...state.toolInputSignatures],
    ownMessages: [...state.ownMessages],
    openText: [...state.openText],
    openReasoning: [...state.openReasoning],
  }
}

function latestUserMessage(
  messages: readonly UIMessage[],
): { readonly id: MessageId; readonly content: CanonicalContent[] } | undefined {
  const message = messages.findLast((entry) => entry.role === 'user')
  if (message === undefined) return undefined

  const messageId = MessageIdSchema.parse(message.id)
  const content = message.parts.flatMap((part, index) => {
    if (part.type === 'text') return [{ type: 'text', text: part.text } satisfies CanonicalContent]
    if (part.type !== 'file') return []
    return [canonicalFileContent(messageId, index, part)]
  })
  return content.length === 0 ? undefined : { id: messageId, content }
}

function canonicalFileContent(
  messageId: MessageId,
  index: number,
  part: Extract<UIMessage['parts'][number], { type: 'file' }>,
): CanonicalContent {
  const data = /^data:([^;,]+);base64,(.*)$/s.exec(part.url)
  if (data !== null && part.mediaType.startsWith('image/')) {
    return { type: 'image', mimeType: part.mediaType, data: data[2] ?? '' }
  }
  if (data !== null && part.mediaType.startsWith('audio/')) {
    return { type: 'audio', mimeType: part.mediaType, data: data[2] ?? '' }
  }
  if (data !== null) {
    return {
      type: 'resource',
      resource: {
        uri: `urn:porte:${messageId}:${index}`,
        mimeType: part.mediaType,
        content: { type: 'blob', data: data[2] ?? '' },
      },
    }
  }
  return {
    type: 'resource-link',
    uri: part.url,
    name: part.filename ?? `Attachment ${index + 1}`,
    mimeType: part.mediaType,
  }
}

function keepsTurnPending(error: PorteErrorPayload): boolean {
  return error._tag === 'HostOfflineError' || error._tag === 'RequestTimeoutError'
}

function errorStreamResponse(message: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'error', errorText: message })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

async function writeChunk(
  writer: WritableStreamDefaultWriter<UIMessageChunk>,
  chunk: UIMessageChunk,
): Promise<void> {
  await writer.write(chunk)
}

async function writeChunks(
  writer: WritableStreamDefaultWriter<UIMessageChunk>,
  chunks: readonly UIMessageChunk[],
): Promise<void> {
  for (const chunk of chunks) {
    // oxlint-disable-next-line no-await-in-loop -- The AI SDK stream keeps projector order.
    await writer.write(chunk)
  }
}

async function closeWriterWithError(
  writer: WritableStreamDefaultWriter<UIMessageChunk>,
  message: string,
): Promise<void> {
  try {
    await writeChunk(writer, { type: 'error', errorText: message })
    await writer.close()
  } catch {
    await writer.abort().catch(() => undefined)
  }
}

function eventKey(eventSequence: EventSequence): string {
  return `${EVENT_PREFIX}${eventSequence.toString().padStart(16, '0')}`
}

function eventTurnId(event: ConversationEvent): TurnId | undefined {
  return 'turnId' in event ? event.turnId : undefined
}

function eventBelongsToTurn(event: ConversationEvent, turnId: TurnId): boolean {
  return event.type === 'conversation.failed' || eventTurnId(event) === turnId
}

function isTerminalEvent(event: ConversationEvent): boolean {
  return event.type === 'turn.finished' || event.type === 'conversation.failed'
}

function earlier(current: number | undefined, candidate: number): number {
  return current === undefined ? candidate : Math.min(current, candidate)
}
