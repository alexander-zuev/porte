import type { CredentialStore } from '@host/application/ports/credential-store.ts'
import type { DeviceAuthorizer } from '@host/application/ports/device-authorizer.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { FileCredentialStore } from '@host/infrastructure/persistence/credential-store.ts'
import { DeviceAuthorizationClient } from '@host/infrastructure/porte/device-authorization-client.ts'

/** Resources used by one pairing command. */
export type PairingResources = {
  readonly credentials: CredentialStore
  readonly authorizer: DeviceAuthorizer
}

/** Create the resources used by one pairing command. */
export function createPairingResources(config: HostConfig): PairingResources {
  return {
    credentials: new FileCredentialStore(config.dataDirectory),
    authorizer: new DeviceAuthorizationClient(config.baseUrl),
  }
}
