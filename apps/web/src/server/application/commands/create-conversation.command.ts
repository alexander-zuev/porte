import { NotAuthorizedError, type ConversationSummary, type UserId } from '@porte/core'
import type { HostRepository } from '@server/domain/host/host.repository.ts'
import type { IHostRelayClient } from '@web/server/application/ports/host-agent-client'

/**
 * Start one conversation in a folder on the account's machine.
 *
 * The relay asks the machine to open a session and records the summary the
 * machine answers with; the list and the phone learn of it from there.
 */
export async function createConversation(
  hosts: HostRepository,
  relay: IHostRelayClient,
  userId: UserId,
  cwd: string,
): Promise<ConversationSummary> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') throw new NotAuthorizedError()

  return relay.createConversation(pairing.host.id, { cwd })
}
