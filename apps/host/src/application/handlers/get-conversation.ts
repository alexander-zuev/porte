import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import type {
  CanonicalContent,
  ConversationItem,
  ConversationState,
  ConversationTurn,
  ToolView,
} from '@porte/core/client'

/** The open conversation snapshot for the Worker first paint. */
export const getConversation: QueryHandler<QueryMap['GetConversation'], ConversationState> = async (
  query,
  deps,
) => omitUnpersistableContent(deps.conversations.get(query.conversationId).snapshot())

/**
 * Drop what the Worker row must not carry: media bytes, and raw tool input and
 * output. Diffs and read bodies stay: measured at under 0.7 MB for the largest
 * turn, and the Worker compacts any row that nears 2 MB.
 */
export function omitUnpersistableContent(state: ConversationState): ConversationState {
  return {
    ...state,
    items: state.items.map(omitUnpersistableItem),
    tools: state.tools.map(omitUnpersistableTool),
  }
}

/** Drop media bytes and raw tool I/O from one turn slice, as `conversation.get` does. */
export function omitUnpersistableTurn(turn: ConversationTurn): ConversationTurn {
  return {
    turnId: turn.turnId,
    items: turn.items.map(omitUnpersistableItem),
    tools: turn.tools.map(omitUnpersistableTool),
  }
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
    content: tool.content.filter(
      (item) => item.type !== 'content' || isPersistableContent(item.content),
    ),
    locations: tool.locations,
  }
  if (tool.name !== undefined) next.name = tool.name
  // oxlint-disable-next-line no-underscore-dangle -- ACP reserves `_meta` for provider data.
  if (tool._meta !== undefined) next._meta = tool._meta
  return next
}
