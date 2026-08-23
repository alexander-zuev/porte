import {
  CONVERSATION_HISTORY_PAGE_SIZE,
  CONVERSATION_PAGE_SIZE,
  conversationRelayStateFromSnapshot,
  type ConversationId,
  type ConversationIdentity,
  type ConversationPage,
  type ReadyConversationRelayState,
  type ReadConversation,
  type TranscriptCursor,
} from '@porte/core/client'
import { getConversation, getConversations } from '@server/entrypoints/functions/conversation.fn.ts'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { UIMessage } from 'ai'

import { porteEventsToMessages } from './porte-events-to-messages.ts'

export type InitialConversation = {
  readonly conversation: ConversationIdentity
  readonly messages: UIMessage[]
  readonly next: TranscriptCursor | null
  readonly state: ReadyConversationRelayState
}

/**
 * Query factory for the conversations on the account's Mac.
 *
 * Paged, because a Mac's history has no bound. The socket never carries the
 * list: it patches one summary or says the list moved, and this refetches.
 *
 * The server function returns the page or throws, so nothing is unwrapped here.
 * A failure reaches the route's `errorComponent`, which reads its tag.
 */
export const conversationQueries = {
  all: ['conversation'] as const,
  list: () =>
    infiniteQueryOptions({
      queryKey: ['conversation', 'list'] as const,
      queryFn: ({ pageParam }: { pageParam: string | null }) =>
        getConversations({ data: { cursor: pageParam, limit: CONVERSATION_PAGE_SIZE } }),
      initialPageParam: null,
      getNextPageParam: (page: ConversationPage) => page.next,
    }),
  detail: (conversationId: ConversationId) =>
    queryOptions({
      queryKey: ['conversation', 'detail', conversationId] as const,
      queryFn: () =>
        readConversationPage({
          conversationId,
          cursor: null,
          limit: CONVERSATION_HISTORY_PAGE_SIZE,
        }),
    }),
}

/** Reads one typed transcript page. A refusal rejects with its tag, as every server function does. */
export async function readConversationPage(params: ReadConversation): Promise<InitialConversation> {
  const transcript = await getConversation({ data: params })
  return {
    conversation: transcript.conversation,
    messages: await porteEventsToMessages(transcript.events),
    next: transcript.next,
    state: conversationRelayStateFromSnapshot(transcript.state),
  }
}
