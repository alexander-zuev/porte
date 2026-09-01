import type { MessageId } from '@porte/core/client'

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
