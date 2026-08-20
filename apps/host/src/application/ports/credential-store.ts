import type { CredentialStoreError } from '@host/application/host-error.ts'
import type { Result } from 'better-result'

/**
 * What pairing leaves behind on this Mac.
 *
 * The base URL is stored beside the token because a credential is only valid
 * against the server that issued it. Keeping them together means `porte up`
 * needs no configuration after pairing, and pointing at a different server
 * cannot silently reuse the wrong token.
 */
export type StoredCredential = {
  readonly baseUrl: string
  readonly token: string
}

/** Where this machine keeps its Porte credential. */
export interface CredentialStore {
  /** The stored credential, or null when this Mac has never paired. */
  read(): Promise<Result<StoredCredential | null, CredentialStoreError>>

  /** Replace whatever is stored. Readable only by this user. */
  write(credential: StoredCredential): Promise<Result<void, CredentialStoreError>>

  /** Forget the credential. Succeeds when there was nothing to forget. */
  clear(): Promise<Result<void, CredentialStoreError>>
}
