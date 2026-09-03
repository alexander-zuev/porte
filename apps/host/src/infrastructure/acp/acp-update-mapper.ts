/* oxlint-disable no-underscore-dangle -- ACP requires the exact `_meta` boundary name. */
import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import {
  assistantMessageId,
  reasoningMessageId,
  userMessageId,
} from '@host/domain/conversation/message-identity.ts'
import {
  mapCanonicalContent,
  mapCommand,
  mapConfiguration,
  mapJson,
  mapLocation,
  mapMeta,
  mapPlan,
  mapToolContent,
} from '@host/infrastructure/acp/acp-content.ts'
import type {
  AcpSessionNotification,
  AcpSessionUpdate,
  GrokTurnCompleted,
} from '@host/infrastructure/acp/message.ts'
import {
  ConversationEventSchema,
  INTERNAL_SERVER_ERROR,
  MessageIdSchema,
  ToolViewSchema,
  createAttemptId,
  createLogger,
  type ConversationCommand,
  type ConversationEvent,
  type ConversationId,
  type ConversationUsage,
  type FailureClassification,
  type MessageId,
  type ToolView,
  type TurnId,
  turnIdFor,
} from '@porte/core/client'
import { TaggedError } from 'better-result'
import { z } from 'zod'

const logger = createLogger('acp-update-mapper')

/** Grok's per-turn key on `user_message_chunk._meta`; the only stable turn id in a stream. */
const promptIndexSchema = z.number().int().nonnegative()

/** Grok marks synthetic user chunks its own TUI never shows, e.g. the reminder after a cancel. */
const hiddenChunkMetaSchema = z.object({ hideFromScrollback: z.literal(true) })

function isHiddenChunk(update: ContentUpdate): boolean {
  return hiddenChunkMetaSchema.safeParse(update._meta).success
}

/** Updates that belong to a turn; outside one they have nowhere to go. */
const TURN_SCOPED_UPDATES: ReadonlySet<AcpSessionUpdate['sessionUpdate']> = new Set([
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
  'plan_update',
  'plan_removed',
])

type EventData = z.input<typeof ConversationEventSchema>
type MessageStream = 'user' | 'assistant' | 'reasoning'
type ContentUpdate = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk' }
>
/** The turn Grok is inside: opened by a typed user chunk, closed by `turn_completed`. */
type ActiveTurn = { readonly turnId: TurnId; readonly promptIndex: number }

/** The agent sent an update in an order the mapper cannot place. */
export class AcpUpdateSequenceError extends TaggedError('AcpUpdateSequenceError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(message: string) {
    super({ message, classification: 'terminal' })
  }
}

/** The agent sent a value that cannot form a canonical event. */
export class AcpUpdateValueError extends TaggedError('AcpUpdateValueError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(message: string) {
    super({ message, classification: 'terminal' })
  }
}

/** The agent sent an update for a different session. */
export class AcpSessionMismatchError extends TaggedError('AcpSessionMismatchError')<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'ACP update belongs to a different session', classification: 'terminal' })
  }
}

/**
 * Converts Grok's session stream into canonical events, for replay
 * (`session/load`) and live updates alike. One instance per open conversation.
 *
 * The stream is the only source of turns. A typed `user_message_chunk` with a
 * new `promptIndex` opens one, whoever typed it; Grok's `turn_completed`
 * closes it. `turn.started` carries a fresh attempt id: the aggregate replaces
 * it when the echo matches a prompt this Host sent.
 *
 * Grok names no message, so ids come from stream boundaries: a chunk on a
 * stream with no open message starts one; `tool_call` and the end of a turn
 * close every open stream.
 *
 * Turn indexes minted here strictly increase. Grok's `promptIndex` is unique
 * only within one Grok process: a second process on the same session restarts
 * its own counter, and the history then repeats an index. The same history
 * maps to the same ids on every load either way.
 */
export class AcpUpdateMapper {
  private turn: ActiveTurn | undefined
  private nextTurnIndex = 0
  private ordinal = 0
  private readonly open = new Map<MessageStream, MessageId>()
  private readonly tools = new Map<string, ToolView>()
  private commandsKey: string | undefined
  private contextTokens: number | undefined

  /**
   * @param conversationId - The session every update must belong to.
   *
   * The mapper keeps its own tool views: the aggregate applies events through
   * the bus asynchronously, so a `tool_call_update` can arrive before the
   * aggregate has folded the `tool_call` it patches.
   */
  constructor(private readonly conversationId: ConversationId) {}

  /** The turn Grok is inside, if any. */
  get runningTurnId(): TurnId | undefined {
    return this.turn?.turnId
  }

  /** The current model's context window; `turn_completed` usage is reported against it. */
  setContextTokens(sizeTokens: number | undefined): void {
    this.contextTokens = sizeTokens
  }

  map(notification: AcpSessionNotification): readonly ConversationEvent[] {
    if (notification.sessionId !== this.conversationId) throw new AcpSessionMismatchError()
    return this.events(this.mapUpdate(notification.update))
  }

  /** Grok's `turn_completed`, from the live or the replay channel. Nothing open is a no-op. */
  completeTurn(completion: GrokTurnCompleted['update']): readonly ConversationEvent[] {
    const turn = this.turn
    if (turn === undefined) return []
    const events = this.closeStreams()
    const usage = this.usage(completion.usage?.totalTokens)
    if (usage !== undefined) events.push({ type: 'conversation.usage.updated', usage })
    events.push({
      type: 'turn.finished',
      turnId: turn.turnId,
      outcome: outcomeOf(completion.stop_reason),
    })
    this.turn = undefined
    return this.events(events)
  }

  private mapUpdate(update: AcpSessionUpdate): EventData[] {
    if (this.turn === undefined && TURN_SCOPED_UPDATES.has(update.sessionUpdate)) {
      // Grok re-broadcasts a session's history to every client holding it; nothing to place it in.
      logger.debug('acp_update_outside_turn', {
        details: { conversationId: this.conversationId, kind: update.sessionUpdate },
      })
      return []
    }
    switch (update.sessionUpdate) {
      case 'user_message_chunk':
        return this.mapUserChunk(update)
      case 'agent_message_chunk':
        return this.mapContent('assistant', update)
      case 'agent_thought_chunk':
        return this.mapContent('reasoning', update)
      case 'tool_call':
        return this.mapToolCall(update)
      case 'tool_call_update':
        return this.mapToolCallUpdate(update)
      case 'plan':
        return [
          {
            type: 'plan.updated',
            turnId: this.requireTurn(),
            plan: { type: 'items', planId: 'legacy', entries: update.entries },
          },
        ]
      case 'plan_update':
        return [{ type: 'plan.updated', turnId: this.requireTurn(), plan: mapPlan(update.plan) }]
      case 'plan_removed':
        return [{ type: 'plan.removed', turnId: this.requireTurn(), planId: update.planId }]
      case 'available_commands_update':
        return this.mapCommands(update.availableCommands.map(mapCommand))
      case 'current_mode_update':
        return [{ type: 'conversation.mode.updated', modeId: update.currentModeId }]
      case 'config_option_update':
        return [
          {
            type: 'conversation.configuration.updated',
            options: update.configOptions.map(mapConfiguration),
          },
        ]
      case 'session_info_update':
        return mapSessionInfo(update)
      case 'usage_update': {
        const usage: ConversationUsage = { usedTokens: update.used, sizeTokens: update.size }
        if (update.cost !== undefined && update.cost !== null) usage.cost = update.cost
        return [{ type: 'conversation.usage.updated', usage }]
      }
      case 'compaction_update':
      case 'compaction_summary_chunk':
        throw new AcpUpdateValueError('ACP sent a compaction update that Porte did not advertise')
    }
    const exhaustive: never = update
    return exhaustive
  }

  /**
   * A typed user chunk opens a turn, or continues the open one when Grok split
   * the prompt into several chunks. A hidden chunk is Grok's own machinery: it
   * keeps its prompt slot so later ids stay stable, but nothing renders and no
   * turn opens.
   */
  private mapUserChunk(update: ContentUpdate): EventData[] {
    const promptIndex = promptIndexSchema.safeParse(update._meta?.promptIndex)
    if (!promptIndex.success) {
      throw new AcpUpdateValueError('ACP user message has no promptIndex')
    }
    if (this.turn?.promptIndex === promptIndex.data) {
      return isHiddenChunk(update) ? [] : this.mapContent('user', update)
    }
    if (isHiddenChunk(update)) {
      this.claimTurnIndex(promptIndex.data)
      return []
    }
    const events = this.endTurnWithoutCompletion()
    const turnId = turnIdFor(this.conversationId, this.claimTurnIndex(promptIndex.data))
    this.turn = { turnId, promptIndex: promptIndex.data }
    this.ordinal = 0
    events.push({ type: 'turn.started', turnId, attemptId: createAttemptId() })
    events.push(...this.mapContent('user', update))
    return events
  }

  /** Grok opened a new turn while one was open: the old one ended with no `turn_completed`. */
  private endTurnWithoutCompletion(): EventData[] {
    const turn = this.turn
    if (turn === undefined) return []
    logger.warn('turn_ended_without_completion', {
      details: { conversationId: this.conversationId, turnId: turn.turnId },
    })
    const events = this.closeStreams()
    events.push({
      type: 'turn.finished',
      turnId: turn.turnId,
      outcome: {
        type: 'failed',
        error: { _tag: INTERNAL_SERVER_ERROR, message: 'Grok ended the turn without a completion' },
      },
    })
    this.turn = undefined
    return events
  }

  /** Grok's index when it is new here; otherwise the next free one, so no turn id repeats. */
  private claimTurnIndex(promptIndex: number): number {
    const index = Math.max(promptIndex, this.nextTurnIndex)
    if (index !== promptIndex) {
      logger.warn('prompt_index_repeated', {
        details: { conversationId: this.conversationId, promptIndex, turnIndex: index },
      })
    }
    this.nextTurnIndex = index + 1
    return index
  }

  private usage(totalTokens: number | undefined): ConversationUsage | undefined {
    if (totalTokens === undefined || this.contextTokens === undefined) return undefined
    return { usedTokens: Math.min(totalTokens, this.contextTokens), sizeTokens: this.contextTokens }
  }

  /** Grok fires the same ~100 KB command list after every tool call; emit it once. */
  private mapCommands(commands: readonly ConversationCommand[]): EventData[] {
    const key = JSON.stringify(commands)
    if (key === this.commandsKey) return []
    this.commandsKey = key
    return [{ type: 'conversation.commands.updated', commands: [...commands] }]
  }

  private mapContent(stream: MessageStream, update: ContentUpdate): EventData[] {
    const turnId = this.requireTurn()
    // The prompt is complete once the agent answers; consumers key on that completion.
    const events: EventData[] = stream === 'user' ? [] : this.closeStream('user')
    let messageId = this.open.get(stream)
    if (messageId === undefined) {
      messageId = this.messageId(stream, turnId, update.messageId)
      this.open.set(stream, messageId)
      events.push(
        stream === 'reasoning'
          ? { type: 'reasoning.started', turnId, messageId }
          : { type: 'message.started', turnId, messageId, role: stream },
      )
    }
    const content = mapCanonicalContent(update.content)
    events.push(
      stream === 'reasoning'
        ? { type: 'reasoning.delta', turnId, messageId, content }
        : { type: 'message.delta', turnId, messageId, content },
    )
    return events
  }

  private messageId(
    stream: MessageStream,
    turnId: TurnId,
    acpMessageId: string | null | undefined,
  ): MessageId {
    if (acpMessageId !== undefined && acpMessageId !== null) {
      const parsed = MessageIdSchema.safeParse(acpMessageId)
      if (!parsed.success) throw new AcpUpdateValueError('ACP message ID is invalid')
      return parsed.data
    }
    if (stream === 'user') return userMessageId(turnId)
    this.ordinal += 1
    return stream === 'assistant'
      ? assistantMessageId(turnId, this.ordinal)
      : reasoningMessageId(turnId, this.ordinal)
  }

  private mapToolCall(update: Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>) {
    const turnId = this.requireTurn()
    const parsed = ToolViewSchema.safeParse({
      toolCallId: update.toolCallId,
      title: update.title,
      kind: update.kind ?? 'other',
      status: update.status ?? 'pending',
      name: update.name ?? undefined,
      content: (update.content ?? []).map(mapToolContent),
      locations: (update.locations ?? []).map(mapLocation),
      rawInput: mapJson(update.rawInput),
      rawOutput: mapJson(update.rawOutput),
      _meta: mapMeta(update._meta),
    })
    if (!parsed.success) throw new AcpUpdateValueError('ACP tool call is invalid')
    this.tools.set(update.toolCallId, parsed.data)
    const events = this.closeStreams()
    events.push({ type: 'tool.updated', turnId, tool: parsed.data })
    return events
  }

  private mapToolCallUpdate(
    update: Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call_update' }>,
  ): EventData[] {
    const turnId = this.requireTurn()
    const current = this.tools.get(update.toolCallId)
    if (current === undefined) {
      throw new AcpUpdateSequenceError('ACP updated a tool call before it started')
    }
    const next: ToolView = { ...current }
    if (update.title !== undefined && update.title !== null) next.title = update.title
    if (update.name !== undefined && update.name !== null) next.name = update.name
    if (update.kind !== undefined && update.kind !== null) next.kind = update.kind
    if (update.status !== undefined && update.status !== null) next.status = update.status
    // An update names only what changed. `null` and an empty content list say
    // nothing, so they never erase the diff or the input an earlier update carried.
    if (update.content !== undefined && update.content !== null && update.content.length > 0) {
      next.content = update.content.map(mapToolContent)
    }
    if (update.locations !== undefined && update.locations !== null) {
      next.locations = update.locations.map(mapLocation)
    }
    if (update.rawInput !== undefined && update.rawInput !== null) {
      next.rawInput = mapJson(update.rawInput)
    }
    if (update.rawOutput !== undefined && update.rawOutput !== null) {
      next.rawOutput = mapJson(update.rawOutput)
    }
    if (update._meta !== undefined && update._meta !== null) next._meta = mapMeta(update._meta)
    const parsed = ToolViewSchema.safeParse(next)
    if (!parsed.success) throw new AcpUpdateValueError('ACP tool update is invalid')
    this.tools.set(update.toolCallId, parsed.data)
    logger.debug('acp_tool_updated', {
      details: {
        toolCallId: update.toolCallId,
        status: parsed.data.status,
        content: parsed.data.content.length,
        rawInput: parsed.data.rawInput === undefined ? 'absent' : 'present',
      },
    })
    return [{ type: 'tool.updated', turnId, tool: parsed.data }]
  }

  private closeStreams(): EventData[] {
    return [...this.open.keys()].flatMap((stream) => this.closeStream(stream))
  }

  private closeStream(stream: MessageStream): EventData[] {
    const turn = this.turn
    const messageId = this.open.get(stream)
    if (turn === undefined || messageId === undefined) return []
    this.open.delete(stream)
    return [
      stream === 'reasoning'
        ? { type: 'reasoning.completed', turnId: turn.turnId, messageId }
        : { type: 'message.completed', turnId: turn.turnId, messageId },
    ]
  }

  private requireTurn(): TurnId {
    if (this.turn === undefined) {
      throw new AcpUpdateSequenceError('ACP update arrived outside a turn')
    }
    return this.turn.turnId
  }

  private events(data: readonly EventData[]): readonly ConversationEvent[] {
    return data.map((item) => {
      const parsed = ConversationEventSchema.safeParse(item)
      if (!parsed.success) throw new AcpUpdateValueError('ACP update cannot form a canonical event')
      return parsed.data
    })
  }
}

/** Grok's `stop_reason` as the relay's outcome; an unknown reason counts as a plain end. */
function outcomeOf(stopReason: string): TurnOutcome {
  switch (stopReason) {
    case 'cancelled':
      return { type: 'cancelled' }
    case 'refusal':
      return { type: 'completed', reason: 'refused' }
    case 'max_tokens':
    case 'max_turn_requests':
      return { type: 'completed', reason: 'limit_reached' }
    default:
      return { type: 'completed', reason: 'completed' }
  }
}

function mapSessionInfo(
  update: Extract<AcpSessionUpdate, { sessionUpdate: 'session_info_update' }>,
): EventData[] {
  if (update.title === undefined && update.updatedAt === undefined) return []
  const metadata: Extract<EventData, { type: 'conversation.metadata.updated' }>['update'] = {}
  if (update.title !== undefined) metadata.title = update.title
  if (update.updatedAt !== undefined) metadata.updatedAt = update.updatedAt
  return [{ type: 'conversation.metadata.updated', update: metadata }]
}
