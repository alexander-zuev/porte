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

/** A move the relay has not confirmed yet: `id` to a 1-based position. */
export type PendingReorder = { readonly id: MessageId; readonly position: number }

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

/**
 * The queue with the commands still in flight applied, so a tap shows its
 * result before the relay confirms it. Same move rule as the relay's
 * `reorderQueued`, so what is shown is what lands.
 *
 * @param queued - The relay's queue in run order.
 * @param removing - Ids with a remove in flight; hidden.
 * @param reorder - The move in flight, if any.
 * @returns The queue as the sheet draws it, numbered from 1.
 */
export function withPendingCommands(
  queued: readonly QueuedMessage[],
  removing: readonly MessageId[],
  reorder: PendingReorder | null,
): readonly QueuedMessage[] {
  const kept = queued.filter((message) => !removing.includes(message.id))
  if (reorder === null) return renumber(kept)
  const moved = kept.find((message) => message.id === reorder.id)
  if (moved === undefined) return renumber(kept)
  const rest = kept.filter((message) => message.id !== reorder.id)
  const at = Math.min(reorder.position - 1, rest.length)
  return renumber([...rest.slice(0, at), moved, ...rest.slice(at)])
}

function renumber(queued: readonly QueuedMessage[]): readonly QueuedMessage[] {
  return queued.map((message, index) => ({ ...message, position: index + 1 }))
}
