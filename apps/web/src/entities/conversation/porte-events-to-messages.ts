import type { ConversationEvent, ToolView } from '@porte/core/client'
import type { UIMessage, UIMessagePart } from 'ai'

import { toolFailureText } from './porte-event-to-chunks.ts'

type Part = UIMessagePart<never, never>

/**
 * A stored transcript, as the messages a chat opens with.
 *
 * Separate from the chunk mapper on purpose. A chunk stream is one assistant
 * answer, so it has no way to say "this was the person": every text chunk lands
 * in an assistant message. History has both sides, so it is built rather than
 * streamed.
 *
 * Everything else is the same vocabulary. An event with no visible form is
 * skipped, which is how the list grows without breaking a screen.
 */
export function porteEventsToMessages(events: readonly ConversationEvent[]): UIMessage[] {
  const messages: UIMessage[] = []
  const tools = new Map<string, Placed>()
  let open: UIMessage | null = null
  let openText: string | null = null

  const close = () => {
    if (open?.parts.length) messages.push(open)
    open = null
    openText = null
  }

  // Assistant work that arrives with no message under it opens one. Its id is
  // the run of messages so far, which nothing else can collide with.
  const assistant = (): UIMessage => {
    if (open?.role === 'assistant') return open

    close()
    open = { id: `assistant-${String(messages.length)}`, role: 'assistant', parts: [] }
    return open
  }

  for (const event of events) {
    switch (event.type) {
      case 'message.started': {
        close()
        open = { id: event.messageId, role: event.role, parts: [] }
        break
      }

      // Deltas are one answer arriving in pieces, not one part each: a code
      // fence split across two of them renders as backticks if they are kept
      // apart.
      case 'message.delta': {
        if (open === null || event.content.type !== 'text') break
        openText = appendText(open, 'text', openText, event.messageId, event.content.text)
        break
      }

      case 'reasoning.delta': {
        if (event.content.type !== 'text') break
        const target = assistant()
        openText = appendText(
          target,
          'reasoning',
          openText,
          `reasoning-${event.messageId}`,
          event.content.text,
        )
        break
      }

      case 'message.completed':
      case 'reasoning.completed': {
        openText = null
        break
      }

      case 'tool.updated': {
        upsertTool(tools, assistant(), event.tool)
        openText = null
        break
      }

      default:
        break
    }
  }

  close()
  return messages
}

/**
 * One run of text, extended rather than repeated.
 *
 * Returns the run now open, so the next delta of the same message extends it
 * and a delta of another one starts its own.
 */
function appendText(
  message: UIMessage,
  type: 'text' | 'reasoning',
  openRun: string | null,
  run: string,
  text: string,
): string {
  const last = message.parts.at(-1)
  if (openRun === run && last?.type === type) {
    last.text += text
    return run
  }

  message.parts.push({ type, text, state: 'done' })
  return run
}

/** Where one tool call was put, so a later view of it lands in the same place. */
type Placed = { readonly message: UIMessage; readonly index: number }

/**
 * One tool call, replaced in place.
 *
 * A tool event carries the whole view, so a later one is the same call further
 * along rather than a second call. Held by call rather than by message: a call
 * that finishes after its message closed still belongs where it started.
 */
function upsertTool(tools: Map<string, Placed>, message: UIMessage, tool: ToolView): void {
  const part: Part = {
    type: 'dynamic-tool',
    toolCallId: tool.toolCallId,
    toolName: tool.title,
    ...(tool.status === 'completed'
      ? { state: 'output-available' as const, input: inputOf(tool), output: tool.content }
      : tool.status === 'failed'
        ? { state: 'output-error' as const, input: inputOf(tool), errorText: toolFailureText(tool) }
        : { state: 'input-available' as const, input: inputOf(tool) }),
  }

  const held = tools.get(tool.toolCallId)
  if (held === undefined) {
    tools.set(tool.toolCallId, { message, index: message.parts.length })
    message.parts.push(part)
    return
  }

  held.message.parts[held.index] = part
}

/** What a tool was asked to do, as much as the canonical view carries. */
type ToolInput = { readonly kind: ToolView['kind']; readonly locations: ToolView['locations'] }

function inputOf(tool: ToolView): ToolInput {
  return { kind: tool.kind, locations: tool.locations }
}
