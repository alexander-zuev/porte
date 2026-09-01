import { NotAuthorizedError, type ConversationId, type UserId } from '@porte/core'
import type { IConversationAgentClient } from '@server/application/ports/conversation-agent-client.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/**
 * One conversation's stored messages, read through its child Agent.
 *
 * The snapshot a page renders before its socket has said anything. The Agent's
 * tagged errors (offline machine, missing conversation) cross RPC and reach
 * the boundary as they are. The payload is the AI SDK's `UIMessage[]`, which
 * nothing on the server reads, so it answers as a `Response`.
 */
export async function getConversationMessages(
  hosts: HostRepository,
  conversationAgent: IConversationAgentClient,
  userId: UserId,
  conversationId: ConversationId,
): Promise<Response> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') throw new NotAuthorizedError()

  const messages = await conversationAgent.readMessages({
    hostId: pairing.host.id,
    conversationId,
  })
  return Response.json(messages)
}
