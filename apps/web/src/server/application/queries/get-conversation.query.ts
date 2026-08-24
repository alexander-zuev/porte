import {
  HostOfflineError,
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
 * the only thing returned.
 */
export async function getConversation(
  hosts: HostRepository,
  relay: HostRelay,
  userId: UserId,
  query: ReadConversation,
): Promise<ConversationTranscript> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') throw new HostOfflineError()

  return relay.readConversation(pairing.host.id, query)
}
