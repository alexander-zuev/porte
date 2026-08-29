import {
  type ConversationEvent,
  type ConversationItem,
  type ConversationView,
  type FailureClassification,
} from '@porte/core/client'
import { TaggedError } from 'better-result'

/** A canonical event cannot update the current conversation view. */
export class ConversationViewError extends TaggedError('ConversationViewError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** The view of a conversation before any event. */
export function emptyConversationView(): ConversationView {
  return { items: [], tools: [], plans: [], pending: { permissions: [], elicitations: [] } }
}

/**
 * Fold one canonical event into the view in place. Turn events are not the view's
 * concern; the aggregate tracks the turn. @throws ConversationViewError on a bad sequence.
 */
export function applyConversationEvent(view: ConversationView, event: ConversationEvent): void {
  switch (event.type) {
    case 'message.started':
      addItem(view, {
        type: 'message',
        turnId: event.turnId,
        messageId: event.messageId,
        role: event.role,
        content: [],
      })
      return
    case 'reasoning.started':
      addItem(view, {
        type: 'reasoning',
        turnId: event.turnId,
        messageId: event.messageId,
        content: [],
      })
      return
    case 'message.delta':
      appendContent(view, event.messageId, 'message', event.content)
      return
    case 'reasoning.delta':
      appendContent(view, event.messageId, 'reasoning', event.content)
      return
    case 'tool.updated': {
      const index = view.tools.findIndex((tool) => tool.toolCallId === event.tool.toolCallId)
      if (index === -1) {
        view.tools.push(event.tool)
        view.items.push({ type: 'tool', turnId: event.turnId, toolCallId: event.tool.toolCallId })
      } else {
        view.tools[index] = event.tool
      }
      return
    }
    case 'plan.updated':
      view.plans = [...view.plans.filter((plan) => plan.planId !== event.plan.planId), event.plan]
      return
    case 'plan.removed':
      view.plans = view.plans.filter((plan) => plan.planId !== event.planId)
      return
    case 'conversation.usage.updated':
      view.usage = event.usage
      return
    case 'conversation.configuration.updated':
      view.configuration = [...event.options]
      return
    case 'conversation.commands.updated':
      view.commands = [...event.commands]
      return
    case 'conversation.mode.updated':
      view.modeId = event.modeId
      return
    case 'permission.requested':
      view.pending.permissions.push({
        turnId: event.turnId,
        permissionId: event.permissionId,
        toolCallId: event.toolCallId,
        title: event.title,
        options: [...event.options],
      })
      return
    case 'permission.resolved':
      view.pending.permissions = view.pending.permissions.filter(
        (permission) => permission.permissionId !== event.permissionId,
      )
      return
    case 'elicitation.requested':
      view.pending.elicitations.push({
        turnId: event.turnId,
        elicitationId: event.elicitationId,
        request: event.request,
      })
      return
    case 'elicitation.resolved':
    case 'elicitation.completed':
      view.pending.elicitations = view.pending.elicitations.filter(
        (elicitation) => elicitation.elicitationId !== event.elicitationId,
      )
      return
    case 'turn.started':
    case 'turn.finished':
    case 'message.completed':
    case 'reasoning.completed':
    case 'conversation.metadata.updated':
    case 'conversation.failed':
      return
  }
}

function addItem(view: ConversationView, item: Exclude<ConversationItem, { type: 'tool' }>): void {
  const exists = view.items.some(
    (current) => current.type !== 'tool' && current.messageId === item.messageId,
  )
  if (exists) throw new ConversationViewError({ message: 'The message already exists' })
  view.items.push(item)
}

function appendContent(
  view: ConversationView,
  messageId: string,
  type: 'message' | 'reasoning',
  content: Extract<ConversationEvent, { type: 'message.delta' }>['content'],
): void {
  const item = view.items.find(
    (current) => current.type !== 'tool' && current.messageId === messageId,
  )
  if (item === undefined || item.type !== type) {
    throw new ConversationViewError({ message: 'The message does not exist' })
  }
  item.content.push(content)
}
