import { HostIdSchema, type ApiResponse } from '@porte/core'

import type { HostAuthenticator, HostIdentity } from '../../application/ports/host-authenticator'

const DEVELOPMENT_HOST_ID = HostIdSchema.parse('0198b55e-49d4-7c8c-9f53-cd16db07ce5b')

/** Slice 2 authenticator that maps fixed development tokens to one host. */
export class DevelopmentHostAuthenticator implements HostAuthenticator {
  constructor(
    private readonly daemonToken: string,
    private readonly clientToken: string,
  ) {}

  authenticate(credential: string | undefined): Promise<ApiResponse<HostIdentity>> {
    if (this.daemonToken === this.clientToken) {
      return Promise.resolve({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Host authentication is unavailable' },
      })
    }
    if (credential === this.daemonToken) {
      return Promise.resolve({
        success: true,
        data: { hostId: DEVELOPMENT_HOST_ID, role: 'daemon' },
      })
    }
    if (credential === this.clientToken) {
      return Promise.resolve({
        success: true,
        data: { hostId: DEVELOPMENT_HOST_ID, role: 'client' },
      })
    }
    return Promise.resolve({
      success: false,
      error: { code: 'NOT_AUTHENTICATED', message: 'Authentication required' },
    })
  }
}
