import {
  ConversationNotFoundError,
  InternalServerError,
  NotAuthorizedError,
  type ConversationId,
  type UserId,
} from '@porte/core'
import type { IConversationAgentClient } from '@server/application/ports/conversation-agent-client.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/**
 * One conversation's stored messages, read through its child Agent.
 *
 * The snapshot a page renders before its socket has said anything. The Agent
 * answers over HTTP, so the request only lends its URL and headers, and its
 * answer is passed through: the payload is the AI SDK's `UIMessage[]`, which
 * nothing on the server reads.
 */
export async function getConversationMessages(
  hosts: HostRepository,
  conversationAgent: IConversationAgentClient,
  userId: UserId,
  conversationId: ConversationId,
  request: Request,
): Promise<Response> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') throw new NotAuthorizedError()

  const response = await conversationAgent.readMessages({
    hostId: pairing.host.id,
    role: 'client',
    conversationId,
    request,
  })
  if (response.status === 404) throw new ConversationNotFoundError()
  if (!response.ok) throw new InternalServerError()

  // An RPC response has immutable headers, and the server-function layer sets one on the way out.
  return new Response(response.body, response)
}
