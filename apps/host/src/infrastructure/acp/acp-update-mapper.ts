/* oxlint-disable no-underscore-dangle -- ACP requires the exact `_meta` boundary name. */
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
import type { AcpSessionNotification, AcpSessionUpdate } from '@host/infrastructure/acp/message.ts'
import {
  ConversationEventSchema,
  MessageIdSchema,
  ToolViewSchema,
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

/** Grok's per-turn key on `user_message_chunk._meta`; the only stable turn id in a replay. */
const promptIndexSchema = z.number().int().nonnegative()

/** Grok marks synthetic user chunks its own TUI never shows, e.g. subagent completion reminders. */
const hiddenChunkMetaSchema = z.object({ hideFromScrollback: z.literal(true) })

function isHiddenChunk(update: ContentUpdate): boolean {
  return hiddenChunkMetaSchema.safeParse(update._meta).success
}

type EventData = z.input<typeof ConversationEventSchema>
type MessageStream = 'user' | 'assistant' | 'reasoning'
type ContentUpdate = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk' }
>
/** Live turns come from the relay; replay turns are grouped by Grok's `promptIndex`. */
type ActiveTurn =
  | { readonly turnId: TurnId; readonly live: true }
  | { readonly turnId: TurnId; readonly live: false; readonly promptIndex: number }

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
 * Converts ACP `session/update` notifications into canonical events, for replay
 * (`session/load`) and live turns alike. One instance per open conversation.
 *
 * Grok names no message (§1 of the redesign doc), so ids come from stream
 * boundaries: a chunk on a stream with no open message starts one; `tool_call`
 * and the end of a turn close every open stream. Turn events themselves belong
 * to the `Conversation` aggregate; the mapper never emits `turn.*`.
 *
 * Turn indexes minted here strictly increase. Grok's `promptIndex` is unique
 * only within one Grok process: a second process on the same session (the
 * TUI beside the Host) restarts its own counter, and the history then repeats
 * an index. The same history maps to the same ids on every load either way.
 */
export class AcpUpdateMapper {
  private turn: ActiveTurn | undefined
  private nextTurnIndex = 0
  private ordinal = 0
  private readonly open = new Map<MessageStream, MessageId>()
  private readonly tools = new Map<string, ToolView>()
  private commandsKey: string | undefined
  private expectedPromptIndex: number | undefined
  private promptIndexChecked = false

  /**
   * @param conversationId - The session every update must belong to.
   *
   * The mapper keeps its own tool views: the aggregate applies events through
   * the bus asynchronously, so a `tool_call_update` can arrive before the
   * aggregate has folded the `tool_call` it patches.
   */
  constructor(private readonly conversationId: ConversationId) {}

  /** The relay turn in flight, if any. Replay turns are not live. */
  get liveTurnId(): TurnId | undefined {
    return this.turn?.live === true ? this.turn.turnId : undefined
  }

  /**
   * A relay turn starts; its user message is raised by the aggregate, not mapped.
   *
   * `expectedPromptIndex` is the aggregate's prediction behind `turnId`. The first
   * live `user_message_chunk` carries Grok's `_meta.promptIndex`; a mismatch is an
   * invariant error, logged once by the caller.
   */
  beginTurn(turnId: TurnId, expectedPromptIndex: number): void {
    if (this.turn?.live === true) {
      throw new AcpUpdateSequenceError('A live turn is already active')
    }
    this.turn = { turnId, live: true }
    this.nextTurnIndex = Math.max(this.nextTurnIndex, expectedPromptIndex + 1)
    this.expectedPromptIndex = expectedPromptIndex
    this.promptIndexChecked = false
    this.ordinal = 0
    this.open.clear()
  }

  /** The prompt settled: close every open stream. */
  endTurn(): readonly ConversationEvent[] {
    if (this.turn?.live !== true) throw new AcpUpdateSequenceError('No live turn is active')
    const events = this.events(this.closeStreams())
    this.turn = undefined
    return events
  }

  map(notification: AcpSessionNotification): readonly ConversationEvent[] {
    if (notification.sessionId !== this.conversationId) throw new AcpSessionMismatchError()
    return this.events(this.mapUpdate(notification.update))
  }

  private mapUpdate(update: AcpSessionUpdate): EventData[] {
    switch (update.sessionUpdate) {
      case 'user_message_chunk':
        if (this.turn?.live === true) {
          this.checkPromptIndex(update)
          return []
        }
        // A hidden chunk is Grok's own machinery (a subagent completion
        // reminder): it keeps its prompt slot so replay ids stay stable,
        // but it is not something anyone said — nothing renders.
        return [
          ...this.startReplayTurn(update),
          ...(isHiddenChunk(update) ? [] : this.mapContent('user', update)),
        ]
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
   * The aggregate predicted the prompt index behind the live turn id; Grok's
   * `_meta.promptIndex` on the echo is the truth. A mismatch means the ids of
   * this turn flip on the next replay, so it is logged loudly, once.
   */
  private checkPromptIndex(update: ContentUpdate): void {
    if (this.promptIndexChecked) return
    this.promptIndexChecked = true
    const actual = promptIndexSchema.safeParse(update._meta?.promptIndex)
    if (!actual.success || actual.data === this.expectedPromptIndex) return
    logger.warn('prompt_index_mismatch', {
      details: {
        conversationId: this.conversationId,
        expected: this.expectedPromptIndex,
        actual: actual.data,
      },
    })
  }

  /** Grok fires the same ~100 KB command list after every tool call; emit it once. */
  private mapCommands(commands: readonly ConversationCommand[]): EventData[] {
    const key = JSON.stringify(commands)
    if (key === this.commandsKey) return []
    this.commandsKey = key
    return [{ type: 'conversation.commands.updated', commands: [...commands] }]
  }

  private startReplayTurn(update: ContentUpdate): EventData[] {
    const promptIndex = promptIndexSchema.safeParse(update._meta?.promptIndex)
    if (!promptIndex.success) {
      throw new AcpUpdateValueError('ACP replay user message has no promptIndex')
    }
    // Real replays repeat a promptIndex when one turn carried several user chunks; same turn.
    if (this.turn?.live === false && this.turn.promptIndex === promptIndex.data) return []
    const closed = this.closeStreams()
    this.turn = {
      turnId: turnIdFor(this.conversationId, this.claimTurnIndex(promptIndex.data)),
      live: false,
      promptIndex: promptIndex.data,
    }
    this.ordinal = 0
    return closed
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

  private mapContent(stream: MessageStream, update: ContentUpdate): EventData[] {
    const turnId = this.requireTurn()
    const events: EventData[] = []
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
    const turn = this.turn
    if (turn === undefined) return []
    const closed: EventData[] = []
    for (const [stream, messageId] of this.open) {
      closed.push(
        stream === 'reasoning'
          ? { type: 'reasoning.completed', turnId: turn.turnId, messageId }
          : { type: 'message.completed', turnId: turn.turnId, messageId },
      )
    }
    this.open.clear()
    return closed
  }

  private requireTurn(): TurnId {
    if (this.turn === undefined)
      throw new AcpUpdateSequenceError('ACP update arrived outside a turn')
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

function mapSessionInfo(
  update: Extract<AcpSessionUpdate, { sessionUpdate: 'session_info_update' }>,
): EventData[] {
  if (update.title === undefined && update.updatedAt === undefined) return []
  const metadata: Extract<EventData, { type: 'conversation.metadata.updated' }>['update'] = {}
  if (update.title !== undefined) metadata.title = update.title
  if (update.updatedAt !== undefined) metadata.updatedAt = update.updatedAt
  return [{ type: 'conversation.metadata.updated', update: metadata }]
}
