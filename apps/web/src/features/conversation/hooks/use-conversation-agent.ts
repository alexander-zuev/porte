import type { UseAgentChatOptions } from '@cloudflare/ai-chat/react'
import type { ConversationId, ConversationLiveState } from '@porte/core/client'
import type { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import { useAgent } from 'agents/react'

export type ConversationAgentClient = ReturnType<
  typeof useAgent<ConversationAgent, ConversationLiveState>
>

/** The callables the composer uses; a story fakes exactly these. */
export type ConversationAgentStub = Pick<
  ConversationAgentClient['stub'],
  'cancelTurn' | 'listCommands' | 'setModel'
>

/**
 * The ConversationAgent fields that the chat component uses.
 *
 * `identified` is the SDK's handshake fact: the sub-agent has answered, so
 * callables and `sendMessage` reach it. The socket's `readyState` says nothing
 * about the sub-agent behind the relay.
 */
export type ConversationAgentConnection = UseAgentChatOptions<ConversationLiveState>['agent'] &
  Pick<ConversationAgentClient, 'identified' | 'name'> & { readonly stub: ConversationAgentStub }

/** The browser's socket to one ConversationAgent, reached through the account's relay. */
export function useConversationAgent(conversationId: ConversationId): ConversationAgentClient {
  return useAgent<ConversationAgent, ConversationLiveState>({
    agent: 'HostRelayAgent',
    basePath: 'api/host/ws',
    sub: [{ agent: 'ConversationAgent', name: conversationId }],
  })
}
