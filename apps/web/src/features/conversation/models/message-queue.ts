import type { MessageId } from '@porte/core/client'
import { MessageIdSchema } from '@porte/core/client'
import { queuedRows } from '@web/lib/conversation/conversation-state-messages.ts'
import type { UIMessage } from 'ai'

/** One message waiting for the running turn to end. Position is 1-based run order. */
export type QueuedMessage = {
  readonly id: MessageId
  readonly position: number
  readonly text: string
  readonly files: number
}

/** What the queue surface can do. Every handler is required: a story passes fakes. */
export type QueueActions = {
  readonly sendNow: (id: MessageId) => void
  readonly remove: (id: MessageId) => void
  /** Move one message to a 1-based position; the others shift. */
  readonly reorder: (id: MessageId, position: number) => void
}

/**
 * The queue as the sheet shows it, from the rows the relay broadcasts.
 *
 * @param messages - The chat's current rows.
 * @returns Queued messages in run order, numbered from 1.
 */
export function queuedMessages(messages: readonly UIMessage[]): readonly QueuedMessage[] {
  return queuedRows(messages).map((row, index) => ({
    id: MessageIdSchema.parse(row.id),
    position: index + 1,
    text: row.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n\n'),
    files: row.parts.filter((part) => part.type === 'file').length,
  }))
}
