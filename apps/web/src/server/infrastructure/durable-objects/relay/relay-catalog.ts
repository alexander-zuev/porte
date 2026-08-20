import { ConversationCatalogSchema, type ConversationCatalog } from '@porte/core'

/** The only key this relay stores. Renaming it orphans what is already written. */
const CATALOG_KEY = 'conversation-catalog'

/**
 * The last list of conversations the Mac reported.
 *
 * Kept so a phone opening cold sees something before the daemon answers, and
 * still sees it when the Mac is away. A cache of a list, never a copy of the
 * work: no message, no file, and no turn is stored here.
 */
export class RelayCatalog {
  constructor(private readonly storage: DurableObjectStorage) {}

  /** Never-synced is a real answer: this account has paired but never connected. */
  async read(): Promise<ConversationCatalog> {
    const stored = await this.storage.get(CATALOG_KEY)
    if (stored === undefined) return { state: 'never-synced' }

    return ConversationCatalogSchema.parse(stored)
  }

  async write(catalog: ConversationCatalog): Promise<void> {
    await this.storage.put(CATALOG_KEY, catalog)
  }
}
