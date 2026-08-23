import {
  ConversationNotFoundError,
  HostOfflineError,
  InternalServerError,
  RequestTimeoutError,
  type ConversationTranscript,
  type ReadConversation,
  type UserId,
} from '@porte/core'
import type { HostRelay } from '@server/application/ports/host-relay.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/**
 * Reads one transcript from the Mac paired to the account.
 *
 * Every way this ends without a transcript is a failure, so the transcript is
 * the only thing returned. The relay answers across an RPC boundary that keeps
 * no error type, so its refusal arrives as a tag and is named here. The tags
 * are listed rather than looked up: one the relay never sends is a change to
 * notice, not one to forward.
 */
export async function getConversation(
  hosts: HostRepository,
  relay: HostRelay,
  userId: UserId,
  query: ReadConversation,
): Promise<ConversationTranscript> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') throw new HostOfflineError()

  const response = await relay.readConversation(pairing.host.id, query)
  if (response.success) return response.data

  switch (response.error._tag) {
    case 'HostOfflineError':
      throw new HostOfflineError()
    case 'RequestTimeoutError':
      throw new RequestTimeoutError()
    case 'ConversationNotFoundError':
      throw new ConversationNotFoundError()
    default:
      throw new InternalServerError()
  }
}
