import type { ConversationId, RelayActiveConversation } from '@porte/core/client'
import { RelayProviderMissing } from '@web/lib/errors/relay-error.ts'
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

type ConversationAttention = {
  readonly activeConversationIds: ReadonlySet<ConversationId>
  readonly unseenConversationIds: ReadonlySet<ConversationId>
  readonly setVisibleConversation: (conversationId: ConversationId | null) => void
}

const ConversationAttentionContext = createContext<ConversationAttention | null>(null)

/** Owns temporary list attention for the current browser lifetime. */
export function ConversationAttentionProvider({
  activeConversations,
  children,
}: {
  readonly activeConversations: readonly RelayActiveConversation[] | null
  readonly children: ReactNode
}) {
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
    () => ({
      activeConversationIds: new Set(active.keys()),
      unseenConversationIds,
      setVisibleConversation,
    }),
    [active, setVisibleConversation, unseenConversationIds],
  )

  return <ConversationAttentionContext value={value}>{children}</ConversationAttentionContext>
}

/** Returns temporary list attention for the current browser. */
export function useConversationAttention(): ConversationAttention {
  const attention = useContext(ConversationAttentionContext)
  if (attention === null) throw new RelayProviderMissing('useConversationAttention')
  return attention
}

/** Marks one conversation visible until its route unmounts. */
export function useVisibleConversation(conversationId: ConversationId): void {
  const { setVisibleConversation } = useConversationAttention()
  useEffect(() => {
    setVisibleConversation(conversationId)
    return () => {
      setVisibleConversation(null)
    }
  }, [conversationId, setVisibleConversation])
}
