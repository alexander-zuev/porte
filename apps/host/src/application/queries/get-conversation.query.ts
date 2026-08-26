import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import {
  ConversationStateSchema,
  type CanonicalContent,
  type ConversationId,
  type ConversationItem,
  type ConversationState,
  type ToolView,
} from '@porte/core/client'

/** Read the open conversation snapshot for the Worker first paint. */
export function getConversation(
  codingAgent: Pick<CodingAgent, 'snapshot'>,
  conversationId: ConversationId,
): ConversationState {
  return omitUnpersistableContent(codingAgent.snapshot(conversationId))
}

/** Drop tool bodies and media bytes the Worker SQLite row cannot store. */
export function omitUnpersistableContent(state: ConversationState): ConversationState {
  return ConversationStateSchema.parse({
    ...state,
    items: state.items.map(omitUnpersistableItem),
    tools: state.tools.map(omitUnpersistableTool),
  })
}

function omitUnpersistableItem(item: ConversationItem): ConversationItem {
  if (item.type === 'tool') return item
  return { ...item, content: item.content.filter(isPersistableContent) }
}

function isPersistableContent(content: CanonicalContent): boolean {
  return content.type === 'text' || content.type === 'resource-link'
}

function omitUnpersistableTool(tool: ToolView): ToolView {
  const next: ToolView = {
    toolCallId: tool.toolCallId,
    title: tool.title,
    kind: tool.kind,
    status: tool.status,
    content: [],
    locations: tool.locations,
  }
  if (tool.name !== undefined) next.name = tool.name
  // oxlint-disable-next-line no-underscore-dangle -- ACP reserves `_meta` for provider data.
  if (tool._meta !== undefined) next._meta = tool._meta
  return next
}
