import type { ConversationSummary } from '@porte/core/client'

/** Whether one conversation owns an active turn. */
export type ConversationTurnStatus = 'idle' | 'running'

/** Whether one completed assistant message needs attention in this browser. */
export type ConversationAttentionStatus = 'none' | 'unseen'

/** One conversation with its independent turn and attention facts. */
export type ConversationListItem = {
  readonly conversation: ConversationSummary
  readonly turnStatus: ConversationTurnStatus
  readonly attentionStatus: ConversationAttentionStatus
}

/** Paging lives in `ready` and the retry in `failed`, so no arm carries a field it cannot use. */
export type ConversationList =
  | { readonly status: 'pending' }
  | {
      readonly status: 'ready'
      readonly conversations: readonly ConversationListItem[]
      /** A machine's history has no bound, so the page shows what was asked for and offers the rest. */
      readonly hasMore: boolean
      readonly isLoadingMore: boolean
      readonly onLoadMore: () => void
    }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }
