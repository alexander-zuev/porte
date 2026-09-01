import { createMessageId, type MessageId } from '@porte/core/client'
import { useMutation } from '@tanstack/react-query'
import {
  queuedMessages,
  type QueueActions,
  type QueuedMessage,
} from '@web/features/conversation/models/message-queue.ts'
import type { PromptInputMessage } from '@web/ui/components/ai-elements/prompt-input.tsx'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import type { UIMessage } from 'ai'
import { useMemo } from 'react'

import type { ConversationAgentStub } from './use-conversation-agent.ts'

/** The one message for a refused queue command; the list itself never changed. */
function refused(what: string): () => void {
  return () => {
    toast.error(`Could not ${what}. Try again.`)
  }
}

export type MessageQueue = {
  /** Run order, from the rows the relay broadcasts. Empty is a state, never undefined. */
  readonly queued: readonly QueuedMessage[]
  /** Queue what the composer holds; the row appears when the relay persists it. */
  readonly queue: (message: PromptInputMessage) => void
  readonly actions: QueueActions
}

/**
 * The queue over the conversation socket. Writes nothing locally: every
 * change lands as a message broadcast, so the list cannot disagree with the
 * relay. A refused command raises a toast and leaves the list as it was.
 *
 * @param stub - The conversation callables.
 * @param messages - The chat's current rows.
 */
export function useMessageQueue(
  stub: ConversationAgentStub,
  messages: readonly UIMessage[],
): MessageQueue {
  const queued = useMemo(() => queuedMessages(messages), [messages])
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
    mutationFn: (messageId: MessageId) => stub.withdrawQueued({ messageId }),
    onError: refused('remove it'),
  })
  const reorder = useMutation({
    mutationFn: (input: { messageId: MessageId; position: number }) => stub.reorderQueued(input),
    onError: refused('reorder'),
  })

  return {
    queued,
    queue: (message) => {
      queue.mutate(message)
    },
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
