import type {
  PorteErrorPayload,
  ConversationTranscript,
  ReadConversation,
  UserId,
} from '@porte/core'
import type { HostRelay } from '@server/application/ports/host-relay.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'
import { Result, type Result as ResultType } from 'better-result'

/** Reads one transcript from the Mac paired to the account. */
export async function getConversation(
  hosts: HostRepository,
  relay: HostRelay,
  userId: UserId,
  query: ReadConversation,
): Promise<ResultType<ConversationTranscript, PorteErrorPayload>> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') {
    return Result.err({ _tag: 'HostOfflineError', message: 'The paired Mac is offline.' })
  }
  return await relay.readConversation(pairing.host.id, query)
}
