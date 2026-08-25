import {
  type AgentCapabilities,
  type ContentBlock,
  type CreateElicitationResponse,
  type JsonRpcId,
} from '@agentclientprotocol/sdk'
import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import type {
  AgentSession,
  AnswerElicitation,
  AnswerPermission,
  SetConfiguration,
  StartTurn,
} from '@host/application/ports/agent-session.ts'
import { applyConversationEvents } from '@host/domain/conversation/conversation-view-reducer.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import {
  answerIncomingRequest,
  parseElicitationRequest,
  parsePermissionRequest,
} from '@host/infrastructure/acp/incoming-request.ts'
import type { AcpSessionNotification, JsonValue } from '@host/infrastructure/acp/message.ts'
import {
  CodingAgentUnavailableError,
  ConversationBusyError,
  ConversationNotFoundError,
  ConversationViewSchema,
  ElicitationIdSchema,
  ElicitationNotFoundError,
  PermissionIdSchema,
  PermissionNotFoundError,
  makeConversationState,
  type CanonicalContent,
  type ConversationEmission,
  type ConversationEvent,
  type ConversationFailurePayload,
  type ConversationId,
  type ConversationTurnState,
  type ConversationView,
  type ElicitationId,
  type PermissionId,
  type TurnId,
} from '@porte/core/client'

import type { GrokAcpClient } from './grok-acp-client.ts'
import { GrokEventMapper, mapGrokConfiguration } from './grok-event-mapper.ts'

type PendingPermission = {
  readonly turnId: TurnId
  readonly optionIds: ReadonlySet<string>
  readonly resolve: (result: JsonValue) => void
}
type PendingElicitation = {
  readonly turnId: TurnId
  readonly resolve: (result: JsonValue) => void
}
type AcpResourceLink = {
  type: 'resource_link'
  uri: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  size?: number
}
type AcpEmbeddedResource =
  | { uri: string; mimeType?: string; text: string }
  | { uri: string; mimeType?: string; blob: string }

/** One active Grok ACP session and its owned process resources. */
export class GrokAcpSession implements AgentSession {
  private mapper: GrokEventMapper | undefined
  private activeTurnId: TurnId | undefined
  private closed = false
  private currentView: ConversationView
  private listener: (emission: ConversationEmission) => void = () => undefined
  private readonly closeListeners = new Set<() => void>()
  private readonly permissions = new Map<PermissionId, PendingPermission>()
  private readonly elicitations = new Map<ElicitationId, PendingElicitation>()
  private readonly urlCompletions = new Map<ElicitationId, TurnId>()

  constructor(
    readonly conversationId: ConversationId,
    private readonly client: GrokAcpClient,
    private readonly cwd: string,
    view: ConversationView,
    private readonly capabilities: AgentCapabilities,
  ) {
    this.currentView = ConversationViewSchema.parse(view)
  }

  get view(): ConversationView {
    return ConversationViewSchema.parse(this.currentView)
  }

  get state() {
    return makeConversationState(this.currentView, this.turn)
  }

  /** What this conversation is doing now, which no stored file records. */
  get turn(): ConversationTurnState {
    return this.activeTurnId === undefined
      ? { state: 'idle' }
      : { state: 'running', turnId: this.activeTurnId }
  }

  setListener(listener: (emission: ConversationEmission) => void): void {
    this.listener = listener
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener)
  }

  async startTurn(command: StartTurn): Promise<void> {
    if (this.closed) {
      throw new ConversationNotFoundError()
    }
    if (this.activeTurnId === command.turnId) return
    if (this.activeTurnId !== undefined) {
      throw new ConversationBusyError()
    }

    const mapper = new GrokEventMapper(this.conversationId, command.turnId)
    const started = mapper.start(command.userMessage)
    this.mapper = mapper
    this.activeTurnId = command.turnId
    try {
      this.send(started)
    } catch (cause) {
      this.mapper = undefined
      this.activeTurnId = undefined
      await this.close()
      throw cause
    }
    void this.executeTurn(command, mapper)
  }

  async cancelTurn(turnId: TurnId): Promise<void> {
    const mapper = this.mapper
    if (this.activeTurnId !== turnId || mapper === undefined) {
      throw new ConversationNotFoundError()
    }
    await this.client.cancelSession({ sessionId: this.conversationId })
    for (const [permissionId, pending] of this.permissions) {
      if (pending.turnId !== turnId) continue
      let mapped: readonly ConversationEvent[]
      try {
        mapped = mapper.permissionCancelled(permissionId)
      } catch (cause) {
        throw new CodingAgentResponseError({ cause })
      }
      this.send(mapped)
      this.permissions.delete(permissionId)
      pending.resolve({ outcome: { outcome: 'cancelled' } })
    }
    for (const [elicitationId, pending] of this.elicitations) {
      if (pending.turnId !== turnId) continue
      this.send([
        {
          type: 'elicitation.resolved',
          turnId,
          elicitationId,
          outcome: { type: 'cancelled' },
        },
      ])
      this.elicitations.delete(elicitationId)
      pending.resolve({ action: 'cancel' })
    }
  }

  async setConfiguration(command: SetConfiguration): Promise<void> {
    const params =
      command.value.type === 'boolean'
        ? {
            sessionId: this.conversationId,
            configId: command.optionId,
            type: 'boolean' as const,
            value: command.value.value,
          }
        : {
            sessionId: this.conversationId,
            configId: command.optionId,
            value: command.value.value,
          }
    const updated = await this.client.setSessionConfigOption(params)
    this.send([
      {
        type: 'conversation.configuration.updated',
        options: mapGrokConfiguration(updated.configOptions),
      },
    ])
  }

  async answerPermission(command: AnswerPermission): Promise<void> {
    const pending = this.permissions.get(command.permissionId)
    if (
      pending === undefined ||
      pending.turnId !== command.turnId ||
      !pending.optionIds.has(command.optionId)
    ) {
      throw new PermissionNotFoundError()
    }
    const mapper = this.mapper
    if (mapper === undefined) throw new ConversationNotFoundError()
    let mapped: readonly ConversationEvent[]
    try {
      mapped = mapper.permissionResolved(command.permissionId, command.optionId)
    } catch (cause) {
      throw new CodingAgentResponseError({ cause })
    }

    this.send(mapped)
    this.permissions.delete(command.permissionId)
    pending.resolve({ outcome: { outcome: 'selected', optionId: command.optionId } })
  }

  async answerElicitation(command: AnswerElicitation): Promise<void> {
    const pending = this.elicitations.get(command.elicitationId)
    if (pending === undefined || pending.turnId !== command.turnId) {
      throw new ElicitationNotFoundError()
    }
    const response = elicitationResponse(command.answer)
    const outcome = elicitationOutcome(command.answer)
    this.send([
      {
        type: 'elicitation.resolved',
        turnId: command.turnId,
        elicitationId: command.elicitationId,
        outcome,
      },
    ])
    this.elicitations.delete(command.elicitationId)
    if (command.answer.type === 'accept') {
      this.urlCompletions.set(command.elicitationId, command.turnId)
    }
    pending.resolve(response)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    let closeCause: unknown
    if (this.activeTurnId !== undefined) {
      try {
        await this.client.cancelSession({ sessionId: this.conversationId })
      } catch (cause) {
        closeCause = cause
      }
      try {
        this.send([
          {
            type: 'turn.finished',
            turnId: this.activeTurnId,
            outcome: { type: 'cancelled' },
          },
        ])
      } catch (cause) {
        closeCause = cause
      }
      this.activeTurnId = undefined
      this.mapper = undefined
    }
    for (const pending of this.permissions.values()) {
      pending.resolve({ outcome: { outcome: 'cancelled' } })
    }
    this.permissions.clear()
    for (const pending of this.elicitations.values()) {
      pending.resolve({ action: 'cancel' })
    }
    this.elicitations.clear()
    this.urlCompletions.clear()
    if (
      this.capabilities.sessionCapabilities?.close !== undefined &&
      this.capabilities.sessionCapabilities.close !== null
    ) {
      try {
        await this.client.closeSession({ sessionId: this.conversationId })
      } catch (cause) {
        closeCause ??= cause
      }
    }
    try {
      await this.client.close()
    } finally {
      for (const listener of this.closeListeners) listener()
      this.closeListeners.clear()
    }
    if (closeCause !== undefined) throw new CodingAgentUnavailableError({ cause: closeCause })
  }

  receiveUpdate(notification: AcpSessionNotification): void {
    try {
      const mapped = this.mapper?.map(notification)
      if (mapped === undefined) return
      this.send(mapped)
    } catch {
      this.failTurn(invalidUpdate())
    }
  }

  answerIncoming(
    requestId: JsonRpcId,
    method: string,
    params: JsonValue | undefined,
  ): Promise<JsonValue> {
    if (method === 'elicitation/create') {
      return this.answerIncomingElicitation(requestId, params)
    }
    if (method !== 'session/request_permission') {
      return answerIncomingRequest(this.cwd, method, params)
    }
    const parsed = parsePermissionRequest(params)
    if (this.mapper === undefined || this.activeTurnId === undefined) {
      throw new AcpClientRequestError({ code: -32600, message: 'no active turn' })
    }

    const permissionId = PermissionIdSchema.parse(
      `${this.activeTurnId}:permission:${String(requestId)}`,
    )
    try {
      const mapped = this.mapper.permissionRequested({
        permissionId,
        toolCallId: parsed.toolCall.toolCallId,
        title: parsed.toolCall.title ?? '',
        options: parsed.options,
      })
      this.send(mapped)
    } catch (cause) {
      throw new AcpClientRequestError({ code: -32603, message: failureMessage(cause) })
    }
    const turnId = this.activeTurnId
    return new Promise((resolve) => {
      this.permissions.set(permissionId, {
        turnId,
        optionIds: new Set(parsed.options.map((option) => option.optionId)),
        resolve,
      })
    })
  }

  completeElicitation(elicitationId: ElicitationId): void {
    const turnId = this.urlCompletions.get(elicitationId)
    if (turnId === undefined) return
    this.urlCompletions.delete(elicitationId)
    try {
      this.send([{ type: 'elicitation.completed', turnId, elicitationId }])
    } catch {
      this.failTurn(invalidUpdate())
    }
  }

  private answerIncomingElicitation(
    requestId: JsonRpcId,
    params: JsonValue | undefined,
  ): Promise<JsonValue> {
    const parsed = parseElicitationRequest(params)
    if (
      parsed.sessionId !== this.conversationId ||
      this.mapper === undefined ||
      this.activeTurnId === undefined
    ) {
      throw new AcpClientRequestError({ code: -32600, message: 'no active turn' })
    }
    const elicitationId = ElicitationIdSchema.parse(
      parsed.elicitationId ?? `${this.activeTurnId}:elicitation:${String(requestId)}`,
    )
    try {
      this.send([
        {
          type: 'elicitation.requested',
          turnId: this.activeTurnId,
          elicitationId,
          request: parsed.request,
        },
      ])
    } catch (cause) {
      throw new AcpClientRequestError({ code: -32603, message: failureMessage(cause) })
    }
    const turnId = this.activeTurnId
    return new Promise((resolve) => {
      this.elicitations.set(elicitationId, { turnId, resolve })
    })
  }

  private async executeTurn(command: StartTurn, mapper: GrokEventMapper): Promise<void> {
    let response
    try {
      response = await this.client.prompt({
        sessionId: this.conversationId,
        prompt: command.userMessage.content.map(toAcpContent),
      })
    } catch {
      if (!this.closed) this.failTurn(codingAgentUnavailable())
      return
    }
    if (this.closed || this.activeTurnId !== command.turnId) return
    const finished = mapper.finish(response.stopReason)
    try {
      this.send(finished)
    } catch {
      this.failTurn(invalidUpdate())
      return
    }
    this.activeTurnId = undefined
    this.mapper = undefined
  }

  private failTurn(error: ConversationFailurePayload): void {
    try {
      const failed = this.mapper?.fail(error)
      if (failed !== undefined) this.send(failed)
    } catch {
      // Turn already failed.
    }
    this.activeTurnId = undefined
    this.mapper = undefined
    void this.close()
  }

  private send(events: readonly ConversationEvent[]): void {
    try {
      this.currentView = applyConversationEvents(this.currentView, events)
    } catch (cause) {
      throw new CodingAgentResponseError({ cause })
    }
    for (const event of events) this.listener({ conversationId: this.conversationId, event })
  }
}

function elicitationResponse(answer: AnswerElicitation['answer']): JsonValue {
  if (answer.type === 'submit') {
    return { action: 'accept', content: answer.values } satisfies CreateElicitationResponse
  }
  if (answer.type === 'accept') {
    return { action: 'accept' } satisfies CreateElicitationResponse
  }
  return { action: answer.type } satisfies CreateElicitationResponse
}

function elicitationOutcome(
  answer: AnswerElicitation['answer'],
): Extract<ConversationEvent, { type: 'elicitation.resolved' }>['outcome'] {
  if (answer.type === 'submit') return { type: 'submitted', values: answer.values }
  if (answer.type === 'accept') return { type: 'accepted' }
  if (answer.type === 'decline') return { type: 'declined' }
  return { type: 'cancelled' }
}

function toAcpContent(content: CanonicalContent): ContentBlock {
  if (content.type === 'resource-link') {
    const link: AcpResourceLink = {
      type: 'resource_link',
      uri: content.uri,
      name: content.name,
    }
    if (content.title !== undefined) link.title = content.title
    if (content.description !== undefined) link.description = content.description
    if (content.mimeType !== undefined) link.mimeType = content.mimeType
    if (content.size !== undefined) link.size = content.size
    return link
  }
  if (content.type !== 'resource') return content

  const resource = content.resource
  const embedded: AcpEmbeddedResource =
    resource.content.type === 'text'
      ? { uri: resource.uri, text: resource.content.text }
      : { uri: resource.uri, blob: resource.content.data }
  if (resource.mimeType !== undefined) embedded.mimeType = resource.mimeType
  return {
    type: 'resource',
    resource: embedded,
  }
}

function codingAgentUnavailable(): ConversationFailurePayload {
  return {
    _tag: 'CodingAgentUnavailableError',
    message: 'Grok stopped before the turn completed.',
  }
}

function invalidUpdate(): ConversationFailurePayload {
  return {
    _tag: 'InternalServerError',
    message: 'Grok returned an invalid conversation update.',
  }
}

function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'internal error'
}
