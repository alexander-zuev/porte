import type { ListConversationsParams, ListConversationsResult, UserId } from '@porte/core'
import type { HostRelay } from '@server/application/ports/host-relay.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/** An account with no Mac has no conversations, which is not a failure to read them. */
const NONE: ListConversationsResult = { conversations: [] }

/**
 * One page of the conversations on the account's Mac.
 *
 * Answered from the relay's own replica, so a person pages through their
 * history whether or not the Mac is awake. Owning no Mac and owning a revoked
 * one read the same here: an empty page. Which of the two it is belongs to the
 * host read.
 */
export async function getConversations(
  hosts: HostRepository,
  relay: HostRelay,
  userId: UserId,
  query: ListConversationsParams,
): Promise<ListConversationsResult> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') return NONE

  return relay.readConversations(pairing.host.id, query)
}
