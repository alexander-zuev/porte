import {
  CONVERSATION_HISTORY_PAGE_SIZE,
  type ConversationEvent,
  type ConversationId,
  type ConversationIdentity,
  type ConversationTurnState,
} from '@porte/core/client'
import { useRelay, useRelayReadyState } from '@web/entities/host/relay-context.tsx'
import type { UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { porteEventsToMessages } from './porte-events-to-messages.ts'

/** One conversation's stored transcript, in the three states a read can be in. */
export type ConversationHistory =
  | { readonly status: 'pending' }
  | {
      readonly status: 'ready'
      readonly conversation: ConversationIdentity
      readonly messages: readonly UIMessage[]
      /** Older turns exist. Absent once the whole transcript has been read. */
      readonly onReadOlder: (() => void) | null
      readonly readingOlder: boolean
      /** A turn was already running when this was read, so the chat re-attaches. */
      readonly resuming: boolean
    }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }

/** One page as it came back, plus where the page before it starts. */
type Page = {
  readonly conversation: ConversationIdentity
  readonly events: readonly ConversationEvent[]
  readonly next: string | null
  readonly turn: ConversationTurnState
}

/**
 * Read one conversation from the Mac's own files.
 *
 * No agent process is started: the transcript is already on disk, and the first
 * prompt is what starts a session. The result is handed to a chat as its
 * opening messages, which is why nothing here holds a chat.
 *
 * Newest turns first. Older pages are prepended on request, because a phone
 * opening a conversation that ran for hours wants the end of it.
 */
export function useConversationHistory(conversationId: ConversationId): ConversationHistory {
  const relay = useRelay()
  const readyState = useRelayReadyState()
  const [attempt, setAttempt] = useState(0)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [held, setHeld] = useState<Older>({ read: '', pages: [], reading: false })

  const retry = useCallback(() => {
    setAttempt((count) => count + 1)
  }, [])

  // Which read the held answer belongs to. A different conversation, or another
  // attempt, is pending in the same render rather than after one.
  const read = `${conversationId}:${String(attempt)}`

  // A cold load reaches here before the socket opens. Asking then fails at once
  // and nothing would ask again, so the read waits for the line and the effect
  // re-runs when it arrives.
  const open = readyState === WebSocket.OPEN

  // Pages read before the first one, and the read they belong to. Derived
  // rather than cleared in an effect, so they are gone in the same render.
  const older = held.read === read ? held : NO_OLDER

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function load() {
      try {
        const page = await relay.request('conversation.read', {
          conversationId,
          cursor: null,
          limit: CONVERSATION_HISTORY_PAGE_SIZE,
        })
        if (!cancelled) setAnswered({ read, outcome: 'read', page })
      } catch (error) {
        if (!cancelled) setAnswered({ read, outcome: 'failed', failure: error })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [relay, conversationId, read, open])

  const first = answered?.read === read && answered.outcome === 'read' ? answered.page : null
  const cursor = older.pages.at(0)?.next ?? first?.next ?? null

  const readOlder = useCallback(() => {
    if (cursor === null) return

    const pagesOf = (current: Older) => (current.read === read ? current.pages : NO_OLDER.pages)
    setHeld((current) => ({ read, pages: pagesOf(current), reading: true }))

    async function readPage() {
      try {
        const page = await relay.request('conversation.read', {
          conversationId,
          cursor,
          limit: CONVERSATION_HISTORY_PAGE_SIZE,
        })
        setHeld((current) => ({ read, pages: [page, ...pagesOf(current)], reading: false }))
      } catch {
        // The button comes back rather than the screen breaking: the turns
        // already on it are still the ones the person came to read.
        setHeld((current) => ({ read, pages: pagesOf(current), reading: false }))
      }
    }

    void readPage()
  }, [relay, conversationId, cursor, read])

  const messages = useMemo(
    () =>
      first === null
        ? []
        : porteEventsToMessages([...older.pages.flatMap((page) => page.events), ...first.events]),
    [first, older.pages],
  )

  if (answered?.read !== read) return { status: 'pending' }
  if (answered.outcome === 'failed') {
    return { status: 'failed', error: answered.failure, onRetry: retry }
  }

  return {
    status: 'ready',
    conversation: answered.page.conversation,
    messages,
    onReadOlder: cursor === null ? null : readOlder,
    readingOlder: older.reading,
    resuming: answered.page.turn.state === 'running',
  }
}

/** One answer, and the read it answered. */
type Answered = { readonly read: string } & (
  | { readonly outcome: 'read'; readonly page: Page }
  | { readonly outcome: 'failed'; readonly failure: unknown }
)

/** Pages read before the first one, oldest first, and the read they belong to. */
type Older = {
  readonly read: string
  readonly pages: readonly Page[]
  readonly reading: boolean
}

const NO_OLDER: Older = { read: '', pages: [], reading: false }
