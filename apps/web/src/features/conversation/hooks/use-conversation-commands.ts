import { notYetImplemented, type ConversationCommand } from '@porte/core/client'

import type { ConversationAgentClient } from './use-conversation-agent.ts'

/** The Host's command list for the composer menu. */
export type ConversationCommands =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly onRetry: () => void }
  | { readonly status: 'ready'; readonly commands: readonly ConversationCommand[] }

/**
 * Read the command list once through the `listCommands` callable. It is about
 * 100 KB, so it never rides on the live state (plan §5.8).
 *
 * @param agent - The conversation socket.
 * @param enabled - False until the menu opens, so the page never pays for it.
 */
export function useConversationCommands(
  agent: ConversationAgentClient,
  enabled: boolean,
): ConversationCommands {
  // TODO(step 4): useQuery keyed by conversation, `enabled`, `staleTime: 'static'`.
  void agent
  void enabled
  return notYetImplemented('step 4')
}
