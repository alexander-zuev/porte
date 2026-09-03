import { createMessageId, MessageIdSchema, type MessageId } from '@porte/core/client'
import { useMutation, useMutationState } from '@tanstack/react-query'
import {
  queuedMessages,
  withPendingCommands,
  type QueueActions,
  type QueuedMessage,
} from '@web/features/conversation/models/message-queue.ts'
import type { PromptInputMessage } from '@web/ui/components/ai-elements/prompt-input.tsx'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import type { UIMessage } from 'ai'

import type { ConversationAgentStub } from './use-conversation-agent.ts'

/** The one message for a refused queue command; the list itself never changed. */
function refused(what: string): () => void {
  return () => {
    toast.error(`Could not ${what}. Try again.`)
  }
}

// Removes in flight are read by key: one `useMutation` only reports its latest call.
const REMOVE_KEY = ['queue', 'remove'] as const

export type MessageQueue = {
  /** Run order, with removes and a reorder still in flight already applied. */
  readonly queued: readonly QueuedMessage[]
  /**
   * Queue what the composer holds. Resolves when the relay persists the row
   * and rejects when it refuses, so the composer clears only on success.
   */
  readonly queue: (message: PromptInputMessage) => Promise<void>
  /** A queue is in flight: the composer holds the words, a second Enter must wait. */
  readonly queuing: boolean
  /** The row Send now took, until it leaves the queue. Its controls are disabled. */
  readonly sendingNow: MessageId | null
  readonly actions: QueueActions
}

/**
 * The queue over the conversation socket. The relay's broadcast is the list;
 * a remove or reorder is shown at the tap by applying the pending command on
 * top of it, and drops out once the command settles, refused or not. Nothing
 * is written locally, so a refused command reverts by itself and toasts.
 *
 * @param stub - The conversation callables.
 * @param messages - The chat's current rows.
 */
export function useMessageQueue(
  stub: ConversationAgentStub,
  messages: readonly UIMessage[],
): MessageQueue {
  const queue = useMutation({
    mutationFn: (message: PromptInputMessage) =>
      stub.queueMessage({
        id: createMessageId(),
        parts: [
          ...(message.text.trim() === '' ? [] : [{ type: 'text' as const, text: message.text }]),
          ...message.files.map((file) =>
            file.filename === undefined
              ? { type: 'file' as const, mediaType: file.mediaType, url: file.url }
              : {
                  type: 'file' as const,
                  mediaType: file.mediaType,
                  url: file.url,
                  filename: file.filename,
                },
          ),
        ],
      }),
    onError: refused('queue the message'),
  })
  const sendNow = useMutation({
    mutationFn: (messageId: MessageId) => stub.sendQueuedNow({ messageId }),
    onError: refused('send it now'),
  })
  const remove = useMutation({
    mutationKey: REMOVE_KEY,
    mutationFn: (messageId: MessageId) => stub.withdrawQueued({ messageId }),
    onError: refused('remove it'),
  })
  const removing = useMutationState({
    filters: { mutationKey: REMOVE_KEY, status: 'pending' },
    select: (mutation) => MessageIdSchema.parse(mutation.state.variables),
  })
  const reorder = useMutation({
    mutationFn: (input: { messageId: MessageId; position: number }) => stub.reorderQueued(input),
    onError: refused('reorder'),
  })
  const moving = reorder.isPending
    ? { id: reorder.variables.messageId, position: reorder.variables.position }
    : null

  const queued = withPendingCommands(queuedMessages(messages), removing, moving)
  // Derived, not stored: the drain takes the row out of the queue and with it this flag.
  const sendingNow =
    sendNow.variables !== undefined &&
    !sendNow.isError &&
    queued.some((message) => message.id === sendNow.variables)
      ? sendNow.variables
      : null

  return {
    queued,
    queue: async (message) => {
      await queue.mutateAsync(message)
    },
    queuing: queue.isPending,
    sendingNow,
    actions: {
      sendNow: (id) => {
        sendNow.mutate(id)
      },
      remove: (id) => {
        remove.mutate(id)
      },
      reorder: (id, position) => {
        reorder.mutate({ messageId: id, position })
      },
    },
  }
}
