/* oxlint-disable no-underscore-dangle -- ACP requires the exact `_meta` boundary name. */
import type {
  LoadSessionResponse,
  NewSessionResponse,
  ResumeSessionResponse,
} from '@agentclientprotocol/sdk'
import type { AcpSessionNotification, AcpSessionUpdate } from '@host/infrastructure/acp/message.ts'
import {
  MessageIdSchema,
  type FailureClassification,
  type MessageId,
  type PermissionId,
  type ConversationId,
  type TurnId,
} from '@porte/core/client'
import {
  ConversationEventSchema,
  ConversationViewSchema,
  ToolViewSchema,
  type CanonicalContent,
  type ConversationEvent,
  type ConversationFailurePayload,
  type ConversationItem,
  type MessageView,
  type ReasoningView,
  type ConversationCommand,
  type ConversationConfigurationOption,
  type ConversationPlan,
  type ConversationUsage,
  type ConversationView,
  type ToolContent,
  type ToolLocation,
  type ToolView,
} from '@porte/core/client'
import { TaggedError } from 'better-result'
import { z } from 'zod'

type EventData = z.input<typeof ConversationEventSchema>
type TurnOutcome = Extract<EventData, { type: 'turn.finished' }>['outcome']
type MessageStream = 'user' | 'assistant' | 'reasoning'
type MapperState = 'ready' | 'active' | 'finished'

/** Grok sent an update in an invalid order. */
export class GrokEventSequenceError extends TaggedError('GrokEventSequenceError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(message: string) {
    super({ message, classification: 'terminal' })
  }
}

/** Grok sent a value that cannot form a canonical event. */
export class GrokEventValueError extends TaggedError('GrokEventValueError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(message: string) {
    super({ message, classification: 'terminal' })
  }
}

/** Grok sent an update for a different conversation. */
export class GrokSessionMismatchError extends TaggedError('GrokSessionMismatchError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(message: string) {
    super({ message, classification: 'terminal' })
  }
}

export type GrokEventMappingError =
  | GrokEventSequenceError
  | GrokEventValueError
  | GrokSessionMismatchError

export function isGrokEventMappingError(cause: unknown): cause is GrokEventMappingError {
  return (
    cause instanceof GrokEventSequenceError ||
    cause instanceof GrokEventValueError ||
    cause instanceof GrokSessionMismatchError
  )
}

/** Converts one live Grok ACP turn into canonical events. */
export class GrokEventMapper {
  private readonly messages = new Map<MessageStream, MessageId>()
  private readonly tools = new Map<string, ToolView>()
  private messageOrdinal = 0
  private state: MapperState = 'ready'

  constructor(
    private readonly conversationId: ConversationId,
    private readonly turnId: TurnId,
  ) {}

  /** Start the turn and record the submitted user prompt. */
  start(userMessage: {
    readonly id: MessageId
    readonly content: readonly CanonicalContent[]
  }): readonly ConversationEvent[] {
    if (this.state !== 'ready') throw new GrokEventSequenceError('The Grok turn already started')
    this.state = 'active'
    const events: EventData[] = [
      { type: 'turn.started', turnId: this.turnId },
      {
        type: 'message.started',
        turnId: this.turnId,
        messageId: userMessage.id,
        role: 'user',
      },
      ...userMessage.content.map(
        (content) =>
          ({
            type: 'message.delta',
            turnId: this.turnId,
            messageId: userMessage.id,
            content,
          }) satisfies EventData,
      ),
      { type: 'message.completed', turnId: this.turnId, messageId: userMessage.id },
    ]
    return this.events(events)
  }

  /** Convert one ACP update from the active turn. */
  map(notification: AcpSessionNotification): readonly ConversationEvent[] {
    if (this.state !== 'active') throw new GrokEventSequenceError('The Grok turn is not active')
    if (notification.sessionId !== this.conversationId) {
      throw new GrokSessionMismatchError('The ACP update belongs to a different conversation')
    }
    return this.mapUpdate(notification.update)
  }

  /** Complete open content and map the ACP stop reason. */
  finish(
    stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled',
  ): readonly ConversationEvent[] {
    let outcome: TurnOutcome
    if (stopReason === 'cancelled') {
      outcome = { type: 'cancelled' }
    } else {
      const reason =
        stopReason === 'end_turn'
          ? 'completed'
          : stopReason === 'refusal'
            ? 'refused'
            : 'limit_reached'
      outcome = { type: 'completed', reason }
    }
    return this.close(outcome)
  }

  /** Complete open content after the active turn fails. */
  fail(error: ConversationFailurePayload): readonly ConversationEvent[] {
    return this.close({ type: 'failed', error })
  }

  /** Map one ACP permission request from the active turn. */
  permissionRequested(input: {
    readonly permissionId: PermissionId
    readonly toolCallId: string
    readonly title: string
    readonly options: readonly {
      readonly optionId: string
      readonly name: string
      readonly kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
    }[]
  }): readonly ConversationEvent[] {
    if (this.state !== 'active') throw new GrokEventSequenceError('The Grok turn is not active')
    return this.events([
      {
        type: 'permission.requested',
        turnId: this.turnId,
        permissionId: input.permissionId,
        toolCallId: input.toolCallId,
        title: input.title,
        options: [...input.options],
      },
    ])
  }

  /** Map the selected answer for one ACP permission request. */
  permissionResolved(permissionId: PermissionId, optionId: string): readonly ConversationEvent[] {
    if (this.state !== 'active') throw new GrokEventSequenceError('The Grok turn is not active')
    return this.events([
      {
        type: 'permission.resolved',
        turnId: this.turnId,
        permissionId,
        outcome: { type: 'selected', optionId },
      },
    ])
  }

  /** Map cancellation for one pending ACP permission request. */
  permissionCancelled(permissionId: PermissionId): readonly ConversationEvent[] {
    if (this.state !== 'active') throw new GrokEventSequenceError('The Grok turn is not active')
    return this.events([
      {
        type: 'permission.resolved',
        turnId: this.turnId,
        permissionId,
        outcome: { type: 'cancelled' },
      },
    ])
  }

  private mapUpdate(update: AcpSessionUpdate): readonly ConversationEvent[] {
    switch (update.sessionUpdate) {
      case 'user_message_chunk':
        return []
      case 'agent_message_chunk':
        return this.mapContent('assistant', update)
      case 'agent_thought_chunk':
        return this.mapContent('reasoning', update)
      case 'tool_call':
        return this.mapToolCall(update)
      case 'tool_call_update':
        return this.mapToolCallUpdate(update)
      case 'plan':
        return this.events([
          {
            type: 'plan.updated',
            turnId: this.turnId,
            plan: { type: 'items', planId: 'legacy', entries: update.entries },
          },
        ])
      case 'plan_update':
        return this.events([
          { type: 'plan.updated', turnId: this.turnId, plan: mapPlan(update.plan) },
        ])
      case 'plan_removed':
        return this.events([{ type: 'plan.removed', turnId: this.turnId, planId: update.planId }])
      case 'available_commands_update':
        return this.events([
          {
            type: 'conversation.commands.updated',
            commands: update.availableCommands.map(mapCommand),
          },
        ])
      case 'current_mode_update':
        return this.events([{ type: 'conversation.mode.updated', modeId: update.currentModeId }])
      case 'config_option_update':
        return this.events([
          {
            type: 'conversation.configuration.updated',
            options: update.configOptions.map(mapConfiguration),
          },
        ])
      case 'session_info_update':
        return this.mapSessionInfo(update)
      case 'usage_update': {
        const usage: ConversationUsage = { usedTokens: update.used, sizeTokens: update.size }
        if (update.cost !== undefined && update.cost !== null) usage.cost = update.cost
        return this.events([{ type: 'conversation.usage.updated', usage }])
      }
      case 'compaction_update':
      case 'compaction_summary_chunk':
        throw new GrokEventValueError('ACP sent a compaction update that Porte did not advertise')
    }
    const exhaustive: never = update
    return exhaustive
  }

  private mapContent(
    stream: MessageStream,
    update: Extract<
      AcpSessionUpdate,
      {
        sessionUpdate: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk'
      }
    >,
  ): readonly ConversationEvent[] {
    const parsedId =
      update.messageId === undefined || update.messageId === null
        ? (this.messages.get(stream) ?? this.fallbackMessageId(stream))
        : valueFromParse(MessageIdSchema.safeParse(update.messageId), 'ACP message ID is invalid')

    const currentId = this.messages.get(stream)
    const events: EventData[] = []
    if (currentId !== undefined && currentId !== parsedId) {
      events.push(
        stream === 'reasoning'
          ? { type: 'reasoning.completed', turnId: this.turnId, messageId: currentId }
          : { type: 'message.completed', turnId: this.turnId, messageId: currentId },
      )
    }
    if (currentId !== parsedId) {
      if (stream === 'reasoning') {
        events.push({ type: 'reasoning.started', turnId: this.turnId, messageId: parsedId })
      } else {
        events.push({
          type: 'message.started',
          turnId: this.turnId,
          messageId: parsedId,
          role: stream,
        })
      }
      this.messages.set(stream, parsedId)
    }
    events.push(
      stream === 'reasoning'
        ? {
            type: 'reasoning.delta',
            turnId: this.turnId,
            messageId: parsedId,
            content: mapCanonicalContent(update.content),
          }
        : {
            type: 'message.delta',
            turnId: this.turnId,
            messageId: parsedId,
            content: mapCanonicalContent(update.content),
          },
    )
    return this.events(events)
  }

  private mapToolCall(
    update: Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>,
  ): readonly ConversationEvent[] {
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
    if (!parsed.success) throw new GrokEventValueError('ACP tool call is invalid')
    this.tools.set(update.toolCallId, parsed.data)
    const completed = this.completeMessages()
    completed.push({ type: 'tool.updated', turnId: this.turnId, tool: parsed.data })
    return this.events(completed)
  }

  private mapToolCallUpdate(
    update: Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call_update' }>,
  ): readonly ConversationEvent[] {
    const current = this.tools.get(update.toolCallId)
    if (current === undefined) {
      throw new GrokEventSequenceError('ACP updated a tool call before it started')
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
    if (!parsed.success) throw new GrokEventValueError('ACP tool update is invalid')
    this.tools.set(update.toolCallId, parsed.data)
    return this.events([{ type: 'tool.updated', turnId: this.turnId, tool: parsed.data }])
  }

  private mapSessionInfo(
    update: Extract<AcpSessionUpdate, { sessionUpdate: 'session_info_update' }>,
  ): readonly ConversationEvent[] {
    if (update.title === undefined && update.updatedAt === undefined) return []
    const metadata: Extract<EventData, { type: 'conversation.metadata.updated' }>['update'] = {}
    if (update.title !== undefined) metadata.title = update.title
    if (update.updatedAt !== undefined) metadata.updatedAt = update.updatedAt
    return this.events([{ type: 'conversation.metadata.updated', update: metadata }])
  }

  private close(outcome: TurnOutcome): readonly ConversationEvent[] {
    if (this.state !== 'active') throw new GrokEventSequenceError('The Grok turn is not active')
    this.state = 'finished'
    const completed = this.completeMessages()
    completed.push({ type: 'turn.finished', turnId: this.turnId, outcome })
    return this.events(completed)
  }

  private completeMessages(): EventData[] {
    const completed: EventData[] = []
    for (const [stream, messageId] of this.messages) {
      completed.push(
        stream === 'reasoning'
          ? { type: 'reasoning.completed', turnId: this.turnId, messageId }
          : { type: 'message.completed', turnId: this.turnId, messageId },
      )
    }
    this.messages.clear()
    return completed
  }

  private events(data: readonly EventData[]): readonly ConversationEvent[] {
    const events: ConversationEvent[] = []
    for (const item of data) {
      const parsed = ConversationEventSchema.safeParse(item)
      if (!parsed.success) {
        throw new GrokEventValueError('ACP update cannot form a canonical event')
      }
      events.push(parsed.data)
    }
    return events
  }

  private fallbackMessageId(stream: MessageStream): MessageId {
    this.messageOrdinal += 1
    return MessageIdSchema.parse(`${this.turnId}:${stream}:${String(this.messageOrdinal)}`)
  }
}

/** Builds one complete conversation view from ACP load updates. */
export class GrokReplayMapper {
  private conversationId: string | undefined
  private messageOrdinal = 0
  private readonly activeMessages = new Map<MessageStream, MessageId>()
  private readonly items: ConversationItem[] = []
  private readonly messages = new Map<MessageId, MessageView | ReasoningView>()
  private readonly tools = new Map<string, ToolView>()
  private readonly plans = new Map<string, ConversationPlan>()
  private usage: ConversationUsage | undefined
  private configuration: ConversationConfigurationOption[] | undefined
  private commands: ConversationCommand[] | undefined
  private modeId: string | undefined

  /** Apply configuration returned by a session setup response. */
  seedSession(response: LoadSessionResponse | NewSessionResponse | ResumeSessionResponse): void {
    if (response.configOptions !== undefined && response.configOptions !== null) {
      this.configuration = response.configOptions.map(mapConfiguration)
    }
    if (response.modes !== undefined && response.modes !== null) {
      this.modeId = response.modes.currentModeId
    }
  }

  /** Apply one ACP update received before session load completes. */
  map(notification: AcpSessionNotification): void {
    if (this.conversationId !== undefined && notification.sessionId !== this.conversationId) {
      throw new GrokSessionMismatchError('ACP replay contains more than one conversation')
    }
    this.conversationId = notification.sessionId
    this.mapUpdate(notification.update)
  }

  /** Validate and return the complete view after ACP load completes. */
  snapshot(expectedConversationId: ConversationId): ConversationView {
    if (this.conversationId !== undefined && this.conversationId !== expectedConversationId) {
      throw new GrokSessionMismatchError('ACP replay belongs to a different conversation')
    }
    const view: ConversationView = {
      items: [...this.items],
      tools: [...this.tools.values()],
      plans: [...this.plans.values()],
      pending: { permissions: [], elicitations: [] },
    }
    if (this.usage !== undefined) view.usage = this.usage
    if (this.configuration !== undefined) view.configuration = this.configuration
    if (this.commands !== undefined) view.commands = this.commands
    if (this.modeId !== undefined) view.modeId = this.modeId
    const parsed = ConversationViewSchema.safeParse(view)
    if (!parsed.success) {
      throw new GrokEventValueError('ACP replay cannot form a complete conversation view')
    }
    return parsed.data
  }

  private mapUpdate(update: AcpSessionUpdate): void {
    switch (update.sessionUpdate) {
      case 'user_message_chunk': {
        this.mapMessage('user', update)
        return
      }
      case 'agent_message_chunk': {
        this.mapMessage('assistant', update)
        return
      }
      case 'agent_thought_chunk': {
        this.mapMessage('reasoning', update)
        return
      }
      case 'tool_call': {
        this.mapToolCall(update)
        return
      }
      case 'tool_call_update': {
        this.mapToolCallUpdate(update)
        return
      }
      case 'plan':
        this.plans.set('legacy', { type: 'items', planId: 'legacy', entries: update.entries })
        return
      case 'plan_update': {
        const plan = mapPlan(update.plan)
        this.plans.set(plan.planId, plan)
        return
      }
      case 'plan_removed':
        this.plans.delete(update.planId)
        return
      case 'available_commands_update':
        this.commands = update.availableCommands.map(mapCommand)
        return
      case 'current_mode_update':
        this.modeId = update.currentModeId
        return
      case 'config_option_update':
        this.configuration = update.configOptions.map(mapConfiguration)
        return
      case 'session_info_update':
        return
      case 'usage_update': {
        this.usage = { usedTokens: update.used, sizeTokens: update.size }
        if (update.cost !== undefined && update.cost !== null) this.usage.cost = update.cost
        return
      }
      case 'compaction_update':
      case 'compaction_summary_chunk':
        throw new GrokEventValueError('ACP sent a compaction update that Porte did not advertise')
    }
    const exhaustive: never = update
    return exhaustive
  }

  private mapMessage(
    stream: MessageStream,
    update: Extract<
      AcpSessionUpdate,
      {
        sessionUpdate: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk'
      }
    >,
  ): void {
    let messageId: MessageId
    if (update.messageId !== undefined && update.messageId !== null) {
      const parsed = MessageIdSchema.safeParse(update.messageId)
      if (!parsed.success) throw new GrokEventValueError('ACP replay message ID is invalid')
      messageId = parsed.data
    } else if (this.activeMessages.get(stream) !== undefined) {
      messageId = MessageIdSchema.parse(this.activeMessages.get(stream))
    } else {
      const conversationId = this.conversationId
      if (conversationId === undefined) {
        throw new GrokEventSequenceError('ACP replay has no conversation')
      }
      this.messageOrdinal += 1
      messageId = MessageIdSchema.parse(
        `${conversationId}:${update.sessionUpdate}:${String(this.messageOrdinal)}`,
      )
    }

    let message = this.messages.get(messageId)
    if (message === undefined) {
      message =
        stream === 'reasoning'
          ? { type: 'reasoning', messageId, content: [] }
          : { type: 'message', messageId, role: stream, content: [] }
      this.messages.set(messageId, message)
      this.items.push(message)
    } else if (
      (stream === 'reasoning' && message.type !== 'reasoning') ||
      (stream !== 'reasoning' && (message.type !== 'message' || message.role !== stream))
    ) {
      throw new GrokEventSequenceError('ACP replay reused one message ID for different content')
    }

    message.content.push(mapCanonicalContent(update.content))
    this.activeMessages.set(stream, messageId)
  }

  private mapToolCall(update: Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>): void {
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
    if (!parsed.success) throw new GrokEventValueError('ACP replay tool call is invalid')
    if (!this.tools.has(update.toolCallId)) {
      this.items.push({ type: 'tool', toolCallId: parsed.data.toolCallId })
    }
    this.tools.set(update.toolCallId, parsed.data)
    this.activeMessages.clear()
  }

  private mapToolCallUpdate(
    update: Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call_update' }>,
  ): void {
    const current = this.tools.get(update.toolCallId)
    if (current === undefined) {
      throw new GrokEventSequenceError('ACP replay updated an unknown tool call')
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
    if (!parsed.success) throw new GrokEventValueError('ACP replay tool update is invalid')
    this.tools.set(update.toolCallId, parsed.data)
  }
}

type AcpContentBlock = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'agent_message_chunk' }
>['content']
type AcpToolContent = NonNullable<
  Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>['content']
>[number]
type AcpToolLocation = NonNullable<
  Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>['locations']
>[number]
type AcpCommand = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'available_commands_update' }
>['availableCommands'][number]
type AcpConfiguration = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'config_option_update' }
>['configOptions'][number]
type AcpMeta = NonNullable<AcpContentBlock['_meta']>
type AcpRawToolValue = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'tool_call' | 'tool_call_update' }
>['rawInput']
type SelectConfiguration = Extract<ConversationConfigurationOption, { type: 'select' }>
type SelectConfigurationValue = Extract<SelectConfiguration['options'][number], { type: 'option' }>

function mapCommand(command: AcpCommand): ConversationCommand {
  const mapped: ConversationCommand = { name: command.name, description: command.description }
  if (command.input !== undefined && command.input !== null) mapped.inputHint = command.input.hint
  return mapped
}

function mapConfiguration(option: AcpConfiguration): ConversationConfigurationOption {
  if (option.type === 'boolean') {
    const mapped: ConversationConfigurationOption = {
      type: 'boolean',
      id: option.id,
      name: option.name,
      currentValue: option.currentValue,
    }
    if (option.description !== undefined && option.description !== null) {
      mapped.description = option.description
    }
    if (option.category !== undefined && option.category !== null) {
      mapped.category = option.category
    }
    return mapped
  }

  const mapped: ConversationConfigurationOption = {
    type: 'select',
    id: option.id,
    name: option.name,
    currentValue: option.currentValue,
    options: option.options.map((value) => {
      if ('group' in value) {
        return {
          type: 'group' as const,
          group: value.group,
          name: value.name,
          options: value.options.map(mapSelectConfigurationValue),
        }
      }
      return mapSelectConfigurationValue(value)
    }),
  }
  if (option.description !== undefined && option.description !== null) {
    mapped.description = option.description
  }
  if (option.category !== undefined && option.category !== null) mapped.category = option.category
  return mapped
}

/** Map the complete ACP configuration list into the Porte contract. */
export function mapGrokConfiguration(
  options: readonly AcpConfiguration[],
): ConversationConfigurationOption[] {
  return options.map(mapConfiguration)
}

function mapSelectConfigurationValue(value: {
  value: string
  name: string
  description?: string | null
}): SelectConfigurationValue {
  const item: SelectConfigurationValue = {
    type: 'option',
    value: value.value,
    name: value.name,
  }
  if (value.description !== undefined && value.description !== null) {
    item.description = value.description
  }
  return item
}

function mapPlan(
  plan: Extract<AcpSessionUpdate, { sessionUpdate: 'plan_update' }>['plan'],
): ConversationPlan {
  if (plan.type === 'items') return { type: 'items', planId: plan.planId, entries: plan.entries }
  if (plan.type === 'file') return { type: 'file', planId: plan.planId, uri: plan.uri }
  return { type: 'markdown', planId: plan.planId, content: plan.content }
}

function mapCanonicalContent(content: AcpContentBlock): CanonicalContent {
  if (content.type === 'resource_link') {
    const mapped: Extract<CanonicalContent, { type: 'resource-link' }> = {
      type: 'resource-link',
      uri: content.uri,
      name: content.name,
    }
    if (content.title !== undefined && content.title !== null) mapped.title = content.title
    if (content.description !== undefined && content.description !== null) {
      mapped.description = content.description
    }
    if (content.mimeType !== undefined && content.mimeType !== null) {
      mapped.mimeType = content.mimeType
    }
    if (content.size !== undefined && content.size !== null) mapped.size = content.size
    copyContentMetadata(mapped, content)
    return mapped
  }
  if (content.type === 'resource') {
    const resource: Extract<CanonicalContent, { type: 'resource' }>['resource'] = {
      uri: content.resource.uri,
      content:
        'text' in content.resource
          ? { type: 'text', text: content.resource.text }
          : { type: 'blob', data: content.resource.blob },
    }
    if (content.resource.mimeType !== undefined && content.resource.mimeType !== null) {
      resource.mimeType = content.resource.mimeType
    }
    if (content.resource._meta !== undefined && content.resource._meta !== null) {
      resource._meta = mapMeta(content.resource._meta)
    }
    const mapped: Extract<CanonicalContent, { type: 'resource' }> = { type: 'resource', resource }
    copyContentMetadata(mapped, content)
    return mapped
  }
  let mapped: Extract<CanonicalContent, { type: 'text' | 'image' | 'audio' }>
  if (content.type === 'text') mapped = { type: 'text', text: content.text }
  else if (content.type === 'audio') {
    mapped = { type: 'audio', data: content.data, mimeType: content.mimeType }
  } else {
    mapped = { type: 'image', data: content.data, mimeType: content.mimeType }
    if (content.uri !== undefined && content.uri !== null) mapped.uri = content.uri
  }
  copyContentMetadata(mapped, content)
  return mapped
}

function mapToolContent(content: AcpToolContent): ToolContent {
  if (content.type === 'content') {
    const mapped: ToolContent = { type: 'content', content: mapCanonicalContent(content.content) }
    if (content._meta !== undefined && content._meta !== null) mapped._meta = mapMeta(content._meta)
    return mapped
  }
  if (content.type === 'diff') {
    const mapped: ToolContent = {
      type: 'diff',
      path: content.path,
      oldText: content.oldText ?? null,
      newText: content.newText,
    }
    if (content._meta !== undefined && content._meta !== null) mapped._meta = mapMeta(content._meta)
    return mapped
  }
  const mapped: ToolContent = { type: 'terminal', terminalId: content.terminalId }
  if (content._meta !== undefined && content._meta !== null) mapped._meta = mapMeta(content._meta)
  return mapped
}

function copyContentMetadata(
  target: Pick<Extract<CanonicalContent, { type: 'text' }>, 'annotations' | '_meta'>,
  source: {
    annotations?: AcpContentBlock['annotations'] | null
    _meta?: AcpMeta | null
  },
): void {
  if (source.annotations !== undefined && source.annotations !== null) {
    const annotations: NonNullable<typeof target.annotations> = {}
    if (source.annotations.audience !== undefined && source.annotations.audience !== null) {
      annotations.audience = [...source.annotations.audience]
    }
    if (source.annotations.lastModified !== undefined && source.annotations.lastModified !== null) {
      annotations.lastModified = source.annotations.lastModified
    }
    if (source.annotations.priority !== undefined && source.annotations.priority !== null) {
      annotations.priority = source.annotations.priority
    }
    if (source.annotations._meta !== undefined && source.annotations._meta !== null) {
      annotations._meta = mapMeta(source.annotations._meta)
    }
    target.annotations = annotations
  }
  if (source._meta !== undefined && source._meta !== null) target._meta = mapMeta(source._meta)
}

function mapJson(value: AcpRawToolValue): z.infer<ReturnType<typeof z.json>> | undefined {
  const parsed = z.json().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function mapMeta(value: AcpMeta | null | undefined) {
  if (value === null || value === undefined) return undefined
  const parsed = z.record(z.string(), z.json()).safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function mapLocation(location: AcpToolLocation): ToolLocation {
  const mapped: ToolLocation = { path: location.path }
  if (location.line !== undefined && location.line !== null) mapped.line = location.line
  return mapped
}

function valueFromParse<T>(
  parsed: { success: true; data: T } | { success: false },
  message: string,
): T {
  if (!parsed.success) throw new GrokEventValueError(message)
  return parsed.data
}
