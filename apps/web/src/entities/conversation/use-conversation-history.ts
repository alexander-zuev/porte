import { CONVERSATION_HISTORY_PAGE_SIZE, type ConversationId } from '@porte/core/client'
import { useQuery } from '@tanstack/react-query'
import type { UIMessage } from 'ai'
import { useCallback, useMemo, useState } from 'react'

import {
  conversationQueries,
  readConversationPage,
  type InitialConversation,
} from './conversation-queries.ts'

export type ConversationHistory =
  | { readonly status: 'pending' }
  | {
      readonly status: 'ready'
      readonly initial: InitialConversation
      readonly messages: readonly UIMessage[]
      readonly onReadOlder: (() => void) | null
      readonly readingOlder: boolean
    }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }

/** Reads the first transcript through Query and prepends older HTTP pages on demand. */
export function useConversationHistory(conversationId: ConversationId): ConversationHistory {
  const first = useQuery(conversationQueries.detail(conversationId))
  const [older, setOlder] = useState<{
    readonly conversationId: ConversationId
    readonly pages: readonly InitialConversation[]
    readonly reading: boolean
  }>({ conversationId, pages: [], reading: false })
  const held = older.conversationId === conversationId ? older : EMPTY_OLDER(conversationId)
  const cursor = held.pages.at(0)?.next ?? first.data?.next ?? null

  const readOlder = useCallback(() => {
    if (cursor === null || held.reading) return
    setOlder({ ...held, reading: true })
    void readConversationPage({
      conversationId,
      cursor,
      limit: CONVERSATION_HISTORY_PAGE_SIZE,
    }).then(
      (page) => {
        setOlder({ conversationId, pages: [page, ...held.pages], reading: false })
        return undefined
      },
      () => {
        setOlder({ ...held, reading: false })
        return undefined
      },
    )
  }, [conversationId, cursor, held])

  const messages = useMemo(
    () => [...held.pages.flatMap((page) => page.messages), ...(first.data?.messages ?? [])],
    [first.data?.messages, held.pages],
  )

  if (first.isPending) return { status: 'pending' }
  if (first.isError) {
    return { status: 'failed', error: first.error, onRetry: () => void first.refetch() }
  }
  return {
    status: 'ready',
    initial: first.data,
    messages,
    onReadOlder: cursor === null ? null : readOlder,
    readingOlder: held.reading,
  }
}

function EMPTY_OLDER(conversationId: ConversationId) {
  return { conversationId, pages: [], reading: false } as const
}
