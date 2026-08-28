import type { ConversationId, RelayActiveConversation } from '@porte/core/client'
import { ProviderMissing } from '@web/lib/errors/provider-missing.ts'
import { useRelay } from '@web/lib/relay/relay-provider.tsx'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  addUnseenConversations,
  completedAssistantConversations,
  indexActiveConversations,
  markConversationSeen,
} from './conversation-attention.ts'

type UnseenConversations = {
  readonly unseenConversationIds: ReadonlySet<ConversationId>
  readonly setVisibleConversation: (conversationId: ConversationId | null) => void
}

const UnseenConversationsContext = createContext<UnseenConversations | null>(null)

/**
 * Remembers which conversations finished a turn while this browser was not
 * looking at them, until each one is opened.
 *
 * Client memory only: it diffs consecutive relay state frames, so it must
 * outlive every signed-in route or a completion on another page is missed.
 */
export function UnseenConversationsProvider({ children }: { readonly children: ReactNode }) {
  const activeConversations = useRelay().state?.activeConversations ?? null
  const previous = useRef<ReadonlyMap<ConversationId, RelayActiveConversation> | null>(null)
  const openedConversationIds = useRef<ReadonlySet<ConversationId>>(new Set())
  const visibleConversationId = useRef<ConversationId | null>(null)
  const [unseenConversationIds, setUnseenConversationIds] = useState<ReadonlySet<ConversationId>>(
    () => new Set(),
  )
  const active = useMemo(
    () => indexActiveConversations(activeConversations ?? []),
    [activeConversations],
  )

  useEffect(() => {
    if (activeConversations === null) return
    const prior = previous.current
    previous.current = active
    if (prior === null) return
    const completed = completedAssistantConversations(prior, active)
    if (completed.length === 0) return
    setUnseenConversationIds((current) =>
      addUnseenConversations(
        current,
        completed,
        openedConversationIds.current,
        visibleConversationId.current,
      ),
    )
  }, [active, activeConversations])

  const setVisibleConversation = useCallback((conversationId: ConversationId | null) => {
    visibleConversationId.current = conversationId
    if (conversationId === null) return
    openedConversationIds.current = new Set([...openedConversationIds.current, conversationId])
    setUnseenConversationIds((current) => markConversationSeen(current, conversationId))
  }, [])

  const value = useMemo(
    () => ({ unseenConversationIds, setVisibleConversation }),
    [setVisibleConversation, unseenConversationIds],
  )

  return <UnseenConversationsContext value={value}>{children}</UnseenConversationsContext>
}

/** Returns the conversations this browser has not looked at since they finished. */
export function useUnseenConversations(): UnseenConversations {
  const unseen = useContext(UnseenConversationsContext)
  if (unseen === null) {
    throw new ProviderMissing('useUnseenConversations', 'UnseenConversationsProvider')
  }
  return unseen
}

/** Marks one conversation visible until its route unmounts. */
export function useVisibleConversation(conversationId: ConversationId): void {
  const { setVisibleConversation } = useUnseenConversations()
  useEffect(() => {
    setVisibleConversation(conversationId)
    return () => {
      setVisibleConversation(null)
    }
  }, [conversationId, setVisibleConversation])
}
