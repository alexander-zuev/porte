import {
  SessionViewSchema,
  type CodingSessionEvent,
  type ConversationItem,
  type SessionView,
} from '@porte/core/coding-session-event'
import { Result, TaggedError, type Result as ResultType } from 'better-result'

/** A canonical event cannot update the current conversation view. */
export class ConversationViewError extends TaggedError('ConversationViewError')<{
  message: string
}> {}

/** Applies canonical events and returns a validated conversation view. */
export function applyConversationEvents(
  current: SessionView,
  events: readonly CodingSessionEvent[],
): ResultType<SessionView, ConversationViewError> {
  let view = SessionViewSchema.parse(current)
  for (const event of events) {
    if (event.type === 'session.snapshot') {
      view = SessionViewSchema.parse(event.view)
      continue
    }
    const applied = applyEvent(view, event)
    if (applied.isErr()) return applied
  }
  const parsed = SessionViewSchema.safeParse(view)
  return parsed.success
    ? Result.ok(parsed.data)
    : Result.err(new ConversationViewError({ message: 'The conversation view is invalid' }))
}

function applyEvent(
  view: SessionView,
  event: Exclude<CodingSessionEvent, { type: 'session.snapshot' }>,
): ResultType<void, ConversationViewError> {
  switch (event.type) {
    case 'message.started':
      return addItem(view, {
        type: 'message',
        messageId: event.messageId,
        role: event.role,
        content: [],
      })
    case 'reasoning.started':
      return addItem(view, { type: 'reasoning', messageId: event.messageId, content: [] })
    case 'message.delta':
      return appendContent(view, event.messageId, 'message', event.content)
    case 'reasoning.delta':
      return appendContent(view, event.messageId, 'reasoning', event.content)
    case 'tool.updated': {
      const index = view.tools.findIndex((tool) => tool.toolCallId === event.tool.toolCallId)
      if (index === -1) {
        view.tools.push(event.tool)
        view.items.push({ type: 'tool', toolCallId: event.tool.toolCallId })
      } else {
        view.tools[index] = event.tool
      }
      return Result.ok()
    }
    case 'plan.updated':
      view.plan = [...event.entries]
      return Result.ok()
    case 'session.usage.updated':
      view.usage = event.usage
      return Result.ok()
    case 'session.configuration.updated':
      view.configuration = [...event.options]
      return Result.ok()
    case 'session.commands.updated':
      view.commands = [...event.commands]
      return Result.ok()
    case 'session.mode.updated':
      view.modeId = event.modeId
      return Result.ok()
    case 'permission.requested':
      view.pending.permissions.push({
        turnId: event.turnId,
        permissionId: event.permissionId,
        toolCallId: event.toolCallId,
        title: event.title,
        options: [...event.options],
      })
      return Result.ok()
    case 'permission.resolved':
      view.pending.permissions = view.pending.permissions.filter(
        (permission) => permission.permissionId !== event.permissionId,
      )
      return Result.ok()
    case 'elicitation.requested':
      view.pending.elicitations.push({
        turnId: event.turnId,
        elicitationId: event.elicitationId,
        request: event.request,
      })
      return Result.ok()
    case 'elicitation.resolved':
    case 'elicitation.completed':
      view.pending.elicitations = view.pending.elicitations.filter(
        (elicitation) => elicitation.elicitationId !== event.elicitationId,
      )
      return Result.ok()
    case 'turn.started':
    case 'turn.finished':
    case 'message.completed':
    case 'reasoning.completed':
    case 'session.metadata.updated':
    case 'session.failed':
      return Result.ok()
  }
  const exhaustive: never = event
  return exhaustive
}

function addItem(
  view: SessionView,
  item: Exclude<ConversationItem, { type: 'tool' }>,
): ResultType<void, ConversationViewError> {
  const exists = view.items.some(
    (current) => current.type !== 'tool' && current.messageId === item.messageId,
  )
  if (exists) {
    return Result.err(new ConversationViewError({ message: 'The message already exists' }))
  }
  view.items.push(item)
  return Result.ok()
}

function appendContent(
  view: SessionView,
  messageId: string,
  type: 'message' | 'reasoning',
  content: Extract<CodingSessionEvent, { type: 'message.delta' }>['content'],
): ResultType<void, ConversationViewError> {
  const item = view.items.find(
    (current) => current.type !== 'tool' && current.messageId === messageId,
  )
  if (item === undefined || item.type !== type) {
    return Result.err(new ConversationViewError({ message: 'The message does not exist' }))
  }
  item.content.push(content)
  return Result.ok()
}
