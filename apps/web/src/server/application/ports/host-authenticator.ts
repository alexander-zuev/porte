import type { ApiResponse, HostId } from '@lras/core'

export type HostRole = 'daemon' | 'client'

export type HostIdentity = {
  hostId: HostId
  role: HostRole
}

/** Authentication capability required by the host WebSocket entrypoint. */
export interface HostAuthenticator {
  authenticate(credential: string | undefined): Promise<ApiResponse<HostIdentity>>
}
