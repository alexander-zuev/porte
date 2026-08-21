import type { ConversationEvent, ToolView } from '@porte/core/client'
import type { UIMessageChunk } from 'ai'

/**
 * What a stream has already said, so it says each thing once.
 *
 * Tool events carry a complete view every time, because a replaced view cannot
 * be corrupted by a duplicate or a reordered event. AI SDK wants a lifecycle
 * instead, so this remembers which calls it has announced and turns the second
 * view of a call into an output rather than another input.
 */
export type ChunkStreamState = {
  readonly announcedTools: Set<string>
  /** Messages the person sent. A chat already holds those; the stream is the answer. */
  readonly ownMessages: Set<string>
  /** Text and reasoning already opened, so a joined-late stream opens them itself. */
  readonly openText: Set<string>
  readonly openReasoning: Set<string>
}

export function createChunkStreamState(): ChunkStreamState {
  return {
    announcedTools: new Set(),
    ownMessages: new Set(),
    openText: new Set(),
    openReasoning: new Set(),
  }
}

/**
 * One canonical event, as the chunks a chat renders.
 *
 * Total over the event union: an event with no representation returns nothing
 * rather than throwing, so a vocabulary that grows never breaks a running turn.
 */
export function porteEventToChunks(
  event: ConversationEvent,
  state: ChunkStreamState,
): UIMessageChunk[] {
  switch (event.type) {
    case 'turn.started':
      return [{ type: 'start' }, { type: 'start-step' }]

    // A failed turn ends as an error, so a truncated answer is not mistaken for
    // a complete one. Cancelling is a finish: the person asked for it.
    case 'turn.finished':
      return event.outcome.type === 'failed'
        ? [{ type: 'error', errorText: event.outcome.error.message }]
        : [{ type: 'finish-step' }, { type: 'finish' }]

    case 'conversation.failed':
      return [{ type: 'error', errorText: event.error.message }]

    // The Mac echoes the prompt back as events. A chat added that message when
    // it sent it, so replaying it here would show it twice, in the wrong voice.
    case 'message.started':
      if (event.role === 'user') {
        state.ownMessages.add(event.messageId)
        return []
      }
      state.openText.add(event.messageId)
      return [{ type: 'text-start', id: event.messageId }]

    case 'message.delta':
      if (state.ownMessages.has(event.messageId) || event.content.type !== 'text') return []
      return [
        ...open(state.openText, event.messageId, 'text-start'),
        { type: 'text-delta', id: event.messageId, delta: event.content.text },
      ]

    case 'message.completed':
      if (!state.openText.delete(event.messageId)) return []
      return [{ type: 'text-end', id: event.messageId }]

    case 'reasoning.started':
      state.openReasoning.add(event.messageId)
      return [{ type: 'reasoning-start', id: event.messageId }]

    case 'reasoning.delta':
      if (event.content.type !== 'text') return []
      return [
        ...open(state.openReasoning, event.messageId, 'reasoning-start'),
        { type: 'reasoning-delta', id: event.messageId, delta: event.content.text },
      ]

    case 'reasoning.completed':
      if (!state.openReasoning.delete(event.messageId)) return []
      return [{ type: 'reasoning-end', id: event.messageId }]

    case 'tool.updated':
      return toolChunks(event.tool, state)

    default:
      // Permission, metadata, and anything added later. A permission is not a
      // message part: it has named options rather than a yes, and it can arrive
      // before the tool it guards, which a chat's approval flow rejects.
      return []
  }
}

/**
 * The opener a chat needs before a delta, when the stream joined after it.
 *
 * A reconnected stream starts mid-answer, and a delta whose start it never saw
 * is an error rather than a missing paragraph.
 */
function open(
  seen: Set<string>,
  id: string,
  type: 'text-start' | 'reasoning-start',
): UIMessageChunk[] {
  if (seen.has(id)) return []

  seen.add(id)
  return [{ type, id }]
}

/**
 * A replaced tool view, as the lifecycle a chat expects.
 *
 * The first sighting announces the call; a terminal status delivers its output.
 * Anything between is the same call still running, which the chat already shows.
 */
function toolChunks(tool: ToolView, state: ChunkStreamState): UIMessageChunk[] {
  const chunks: UIMessageChunk[] = []

  if (!state.announcedTools.has(tool.toolCallId)) {
    state.announcedTools.add(tool.toolCallId)
    chunks.push({
      type: 'tool-input-available',
      toolCallId: tool.toolCallId,
      toolName: tool.title,
      input: { kind: tool.kind, locations: tool.locations },
      dynamic: true,
    })
  }

  if (tool.status === 'completed') {
    chunks.push({
      type: 'tool-output-available',
      toolCallId: tool.toolCallId,
      output: tool.content,
      dynamic: true,
    })
  }

  if (tool.status === 'failed') {
    chunks.push({
      type: 'tool-output-error',
      toolCallId: tool.toolCallId,
      errorText: toolFailureText(tool),
      dynamic: true,
    })
  }

  return chunks
}

/** What went wrong, as the tool reported it. The title is its name, not a reason. */
export function toolFailureText(tool: ToolView): string {
  const said = tool.content
    .map((entry) =>
      entry.type === 'content' && entry.content.type === 'text' ? entry.content.text : '',
    )
    .filter((text) => text !== '')
    .join('\n')

  return said === '' ? `${tool.title} failed.` : said
}
