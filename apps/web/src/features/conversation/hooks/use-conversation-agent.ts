import type { UseAgentChatOptions } from '@cloudflare/ai-chat/react'
import type { ConversationId, ConversationRelayState } from '@porte/core/client'
import type { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import { useAgent } from 'agents/react'

export type ConversationAgentClient = ReturnType<
  typeof useAgent<ConversationAgent, ConversationRelayState>
>

/** The ConversationAgent fields that the chat component uses. */
export type ConversationAgentConnection = UseAgentChatOptions<ConversationRelayState>['agent'] &
  Pick<ConversationAgentClient, 'OPEN' | 'readyState'>

/** The browser's socket to one ConversationAgent, reached through the account's relay. */
export function useConversationAgent(conversationId: ConversationId): ConversationAgentClient {
  return useAgent<ConversationAgent, ConversationRelayState>({
    agent: 'HostRelayAgent',
    basePath: 'api/host/ws',
    sub: [{ agent: 'ConversationAgent', name: conversationId }],
  })
}
