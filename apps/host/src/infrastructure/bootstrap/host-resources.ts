import type { HostApplicationResources } from '@host/application/host-application-resources.ts'
import { HostNotPairedError } from '@host/application/host-not-paired-error.ts'
import type { StoredCredential } from '@host/application/ports/credential-store.ts'
import { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'
import type { HostConfig } from '@host/entrypoints/cli/host-config.ts'
import { GrokAgent } from '@host/infrastructure/grok/grok-agent.ts'
import { FileConversationCreationStore } from '@host/infrastructure/persistence/conversation-creation-store.ts'
import { FileCredentialStore } from '@host/infrastructure/persistence/credential-store.ts'

/** Resources held for one complete `porte up` lifespan. */
export type HostResources = HostApplicationResources & {
  readonly credential: StoredCredential
}

/** Create the resources required by one `porte up` lifespan. */
export async function createHostResources(config: HostConfig): Promise<HostResources> {
  const credentials = new FileCredentialStore(config.dataDirectory)
  const credential = await credentials.read()
  if (credential === null) throw new HostNotPairedError()

  return {
    agent: new GrokAgent({ grokHome: config.grokHome }),
    catalog: new ConversationCatalog(),
    creations: new FileConversationCreationStore(config.dataDirectory),
    credential,
  }
}
