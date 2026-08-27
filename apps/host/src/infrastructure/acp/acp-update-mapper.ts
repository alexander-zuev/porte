/* oxlint-disable no-underscore-dangle -- ACP requires the exact `_meta` boundary name. */
import {
  assistantMessageId,
  reasoningMessageId,
  replayTurnId,
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
  type ConversationCommand,
  type ConversationEvent,
  type ConversationId,
  type ConversationUsage,
  type FailureClassification,
  type MessageId,
  type ToolView,
  type TurnId,
} from '@porte/core/client'
import { TaggedError } from 'better-result'
import { z } from 'zod'

/** Grok's per-turn key on `user_message_chunk._meta`; the only stable turn id in a replay. */
const promptIndexSchema = z.number().int().nonnegative()

type EventData = z.input<typeof ConversationEventSchema>
type MessageStream = 'user' | 'assistant' | 'reasoning'
type ContentUpdate = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk' }
>
/** Live turns come from the relay; replay turns are keyed by Grok's `promptIndex`. */
type ActiveTurn = { readonly turnId: TurnId; readonly live: boolean }

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
 */
export class AcpUpdateMapper {
  private turn: ActiveTurn | undefined
  private ordinal = 0
  private readonly open = new Map<MessageStream, MessageId>()
  private readonly tools = new Map<string, ToolView>()
  private commandsKey: string | undefined

  constructor(private readonly conversationId: ConversationId) {}

  /** A relay turn starts; its user message is raised by the aggregate, not mapped. */
  beginTurn(turnId: TurnId): void {
    if (this.turn?.live === true) {
      throw new AcpUpdateSequenceError('A live turn is already active')
    }
    this.turn = { turnId, live: true }
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
        if (this.turn?.live === true) return []
        return [...this.startReplayTurn(update), ...this.mapContent('user', update)]
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
    const closed = this.closeStreams()
    this.turn = { turnId: replayTurnId(this.conversationId, promptIndex.data), live: false }
    this.ordinal = 0
    return closed
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
    if (update.content !== undefined && update.content !== null) {
      next.content = update.content.map(mapToolContent)
    }
    if (update.locations !== undefined && update.locations !== null) {
      next.locations = update.locations.map(mapLocation)
    }
    if (update.rawInput !== undefined) next.rawInput = mapJson(update.rawInput)
    if (update.rawOutput !== undefined) next.rawOutput = mapJson(update.rawOutput)
    if (update._meta !== undefined && update._meta !== null) next._meta = mapMeta(update._meta)
    const parsed = ToolViewSchema.safeParse(next)
    if (!parsed.success) throw new AcpUpdateValueError('ACP tool update is invalid')
    this.tools.set(update.toolCallId, parsed.data)
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
