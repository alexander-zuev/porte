import type { UseAgentChatOptions } from '@cloudflare/ai-chat/react'
import type { ConversationId, ConversationLiveState } from '@porte/core/client'
import type { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import { useAgent } from 'agents/react'

export type ConversationAgentClient = ReturnType<
  typeof useAgent<ConversationAgent, ConversationLiveState>
>

/** The ConversationAgent fields that the chat component uses. */
export type ConversationAgentConnection = UseAgentChatOptions<ConversationLiveState>['agent'] &
  Pick<ConversationAgentClient, 'OPEN' | 'readyState'>

/** The browser's socket to one ConversationAgent, reached through the account's relay. */
export function useConversationAgent(conversationId: ConversationId): ConversationAgentClient {
  return useAgent<ConversationAgent, ConversationLiveState>({
    agent: 'HostRelayAgent',
    basePath: 'api/host/ws',
    sub: [{ agent: 'ConversationAgent', name: conversationId }],
  })
}
