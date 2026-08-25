import type { HostId } from '@porte/core'

/** Which authenticated side opens an Agent WebSocket. */
export type AgentConnectionRole = 'daemon' | 'client'

/** Shared facts required to forward one authenticated Agent upgrade. */
export type AgentConnection = {
  readonly hostId: HostId
  readonly role: AgentConnectionRole
  readonly request: Request
}
