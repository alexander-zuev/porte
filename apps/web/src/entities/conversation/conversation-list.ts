import type { ConversationSummary } from '@porte/core/client'

/** Paging lives in `ready` and the retry in `failed`, so no arm carries a field it cannot use. */
export type ConversationList =
  | { readonly status: 'pending' }
  | {
      readonly status: 'ready'
      readonly conversations: readonly ConversationSummary[]
      /** A Mac's history has no bound, so the page shows what was asked for and offers the rest. */
      readonly hasMore: boolean
      readonly isLoadingMore: boolean
      readonly onLoadMore: () => void
    }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }
