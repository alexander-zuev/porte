import type { AgentContext } from 'agents'

import type { SequencePersistence } from './host-json-rpc-socket.ts'

/** One fixed key: only the current Host connection's expectation matters. */
const KEY = 'host-notification-seq'

type StoredSequence = {
  readonly connectionId: string
  readonly lastSeq: number
}

/**
 * The `seq` expectation in DO storage, under one key that a new Host
 * connection overwrites. A DO wake builds a new socket client while the Host's
 * counter continues, so this must not live in memory.
 *
 * @param ctx - The Agent's Durable Object context.
 * @returns The persistence the `HostJsonRpcSocket` orders by.
 */
export function hostSequenceStorage(ctx: AgentContext): SequencePersistence {
  return {
    load: async (connectionId) => {
      const stored = await ctx.storage.get<StoredSequence>(KEY)
      return stored?.connectionId === connectionId ? stored.lastSeq : 0
    },
    save: async (connectionId, lastSeq) => {
      await ctx.storage.put<StoredSequence>(KEY, { connectionId, lastSeq })
    },
  }
}
