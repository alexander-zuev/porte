import type { ConversationCommand } from '@porte/core/client'
import { useQuery } from '@tanstack/react-query'

import type { ConversationAgentConnection } from './use-conversation-agent.ts'

/** The Host's command list for the composer menu. */
export type ConversationCommands =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly onRetry: () => void }
  | { readonly status: 'ready'; readonly commands: readonly ConversationCommand[] }

/**
 * Read the command list once through the `listCommands` callable. It is about
 * 100 KB, so it never rides on the live state (plan §5.8).
 *
 * @param agent - The conversation socket; its `name` is the conversation id.
 * @param enabled - False until the menu opens, so the page never pays for it.
 */
export function useConversationCommands(
  agent: Pick<ConversationAgentConnection, 'name' | 'stub'>,
  enabled: boolean,
): ConversationCommands {
  const query = useQuery({
    queryKey: ['conversation', 'commands', agent.name] as const,
    queryFn: () => agent.stub.listCommands(),
    enabled,
    // Grok's command list changes only with a Grok update, which reopens the page.
    staleTime: 'static',
  })
  if (query.status === 'success') return { status: 'ready', commands: query.data }
  if (query.status === 'error') {
    return {
      status: 'failed',
      onRetry: () => {
        void query.refetch()
      },
    }
  }
  return { status: 'pending' }
}
