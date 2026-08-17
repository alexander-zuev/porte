import type { SessionSummary } from '@lras/core'
import { Result, type Result as ResultType } from 'better-result'

import type { SessionStoreError } from '../errors.ts'

type CatalogEntry = {
  readonly summary: SessionSummary
}

/** Stored session capability required by the session catalog. */
export interface SessionCatalogSource {
  /** List stored sessions in display order. */
  list(): Promise<ResultType<readonly CatalogEntry[], SessionStoreError>>
}

/** Lists the public session summaries available on this host. */
export class SessionCatalog {
  constructor(private readonly source: SessionCatalogSource) {}

  /** List session summaries in display order. */
  async list(): Promise<ResultType<SessionSummary[], SessionStoreError>> {
    const entries = await this.source.list()
    if (entries.isErr()) return Result.err(entries.error)
    return Result.ok(entries.value.map((entry) => entry.summary))
  }
}
