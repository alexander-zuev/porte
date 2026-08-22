import {
  CONVERSATION_PAGE_SIZE,
  IsoDateTimeSchema,
  type ConversationId,
  type ConversationSummary,
} from '@porte/core'
import { createRelayDatabase } from '@server/infrastructure/persistence/relay/connection.ts'
import { DrizzleConversationRepository } from '@server/infrastructure/persistence/repositories/conversation.repository.ts'
import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const RUN = 'run-1'

/**
 * The repository over one relay's real storage.
 *
 * The relay itself has already migrated by the time this runs: its constructor
 * does that under `blockConcurrencyWhile`, which is what makes this the schema
 * a deployed relay actually has.
 */
async function withStore(
  name: string,
  body: (conversations: DrizzleConversationRepository) => void,
) {
  // `wrangler types` unions every environment, so every binding is optional in
  // that type. Checked rather than asserted, so a missing binding says so.
  const relays = env.HOST_RELAY_DO
  if (relays === undefined) throw new Error('HOST_RELAY_DO is not bound in the test environment')

  const stub = relays.get(relays.idFromName(name))
  await runInDurableObject(stub, (_relay, state) => {
    body(new DrizzleConversationRepository(createRelayDatabase(state.storage)))
  })
}

function conversation(index: number, at: string): ConversationSummary {
  return {
    id: `01a0292c-0000-7000-8000-${String(index).padStart(12, '0')}` as ConversationId,
    cwd: '/Users/az/projects/porte',
    title: `conversation ${String(index)}`,
    updatedAt: IsoDateTimeSchema.parse(at),
  }
}

/** Distinct, ordered timestamps for a list too long to write by hand. */
function minutesIn(index: number): string {
  return new Date(Date.UTC(2026, 7, 20, 10, index)).toISOString()
}

describe('conversation repository', () => {
  it('applies its migration and reads back what it wrote', async () => {
    await withStore('migrate', (conversations) => {
      conversations.saveAll([conversation(1, '2026-08-20T10:00:00.000Z')], RUN)

      const page = conversations.findPage({ cursor: null, limit: CONVERSATION_PAGE_SIZE })
      expect(page.conversations).toHaveLength(1)
      expect(page.conversations[0]?.title).toBe('conversation 1')
      expect(page.conversations[0]?.updatedAt).toBe('2026-08-20T10:00:00.000Z')
      expect(page.next).toBeNull()
    })
  })

  it('orders newest first', async () => {
    await withStore('order', (conversations) => {
      conversations.saveAll(
        [
          conversation(1, '2026-08-20T10:00:00.000Z'),
          conversation(2, '2026-08-22T10:00:00.000Z'),
          conversation(3, '2026-08-21T10:00:00.000Z'),
        ],
        RUN,
      )

      const page = conversations.findPage({ cursor: null, limit: 10 })
      expect(page.conversations.map((one) => one.title)).toEqual([
        'conversation 2',
        'conversation 3',
        'conversation 1',
      ])
    })
  })

  it('pages through every row exactly once', async () => {
    await withStore('paging', (conversations) => {
      const all = Array.from({ length: 7 }, (_, index) =>
        conversation(index, `2026-08-2${String(index)}T10:00:00.000Z`),
      )
      conversations.saveAll(all, RUN)

      const seen: string[] = []
      let cursor: string | null = null
      do {
        const page = conversations.findPage({ cursor, limit: 3 })
        seen.push(...page.conversations.map((one) => one.id))
        cursor = page.next
      } while (cursor !== null)

      expect(seen).toHaveLength(7)
      expect(new Set(seen).size).toBe(7)
    })
  })

  it('breaks a tie on updatedAt with the id, so a cursor never repeats a row', async () => {
    await withStore('ties', (conversations) => {
      const sameMoment = '2026-08-20T10:00:00.000Z'
      conversations.saveAll(
        [conversation(1, sameMoment), conversation(2, sameMoment), conversation(3, sameMoment)],
        RUN,
      )

      const first = conversations.findPage({ cursor: null, limit: 2 })
      const second = conversations.findPage({ cursor: first.next, limit: 2 })
      const ids = [...first.conversations, ...second.conversations].map((one) => one.id)

      expect(new Set(ids).size).toBe(3)
    })
  })

  it('sweeps only the rows an earlier run wrote', async () => {
    await withStore('sweep', (conversations) => {
      conversations.saveAll(
        [conversation(1, '2026-08-20T10:00:00.000Z'), conversation(2, '2026-08-21T10:00:00.000Z')],
        'run-old',
      )
      // The next run reports only one of them: the other is gone from the Mac.
      conversations.saveAll([conversation(1, '2026-08-22T10:00:00.000Z')], 'run-new')
      conversations.deleteOtherThan('run-new')

      const page = conversations.findPage({ cursor: null, limit: 10 })
      expect(page.conversations.map((one) => one.title)).toEqual(['conversation 1'])
    })
  })

  it('reads the current run back from the rows', async () => {
    await withStore('run-id', (conversations) => {
      expect(conversations.currentSyncRunId()).toBeNull()

      conversations.saveAll([conversation(1, '2026-08-20T10:00:00.000Z')], RUN)
      expect(conversations.currentSyncRunId()).toBe(RUN)
    })
  })

  it('keeps the newest rows when capped', async () => {
    await withStore('cap', (conversations) => {
      const all = Array.from({ length: 5 }, (_, index) =>
        conversation(index, `2026-08-2${String(index)}T10:00:00.000Z`),
      )
      conversations.saveAll(all, RUN)
      conversations.deleteBeyond(2)

      const page = conversations.findPage({ cursor: null, limit: 10 })
      expect(page.conversations.map((one) => one.title)).toEqual([
        'conversation 4',
        'conversation 3',
      ])
    })
  })

  /**
   * Durable Object SQLite binds at most 100 parameters per statement, and a row
   * costs one per column. Both of these wrote a single statement once, which
   * threw on the socket carrying the sync and left the Mac reconnecting.
   */
  it('saves a whole sync chunk, past the bound-parameter cap', async () => {
    await withStore('bulk-save', (conversations) => {
      const all = Array.from({ length: 500 }, (_, index) => conversation(index, minutesIn(index)))

      conversations.saveAll(all, RUN)

      expect(conversations.findPage({ cursor: null, limit: 1000 }).conversations).toHaveLength(500)
    })
  })

  it('caps far above the bound-parameter limit', async () => {
    await withStore('bulk-cap', (conversations) => {
      const all = Array.from({ length: 300 }, (_, index) => conversation(index, minutesIn(index)))
      conversations.saveAll(all, RUN)

      conversations.deleteBeyond(250)

      const kept = conversations.findPage({ cursor: null, limit: 1000 }).conversations
      expect(kept).toHaveLength(250)
      // Newest first, so the survivors are the tail of what went in.
      expect(kept[0]?.title).toBe('conversation 299')
      expect(kept.at(-1)?.title).toBe('conversation 50')
    })
  })

  it('deletes one, and empties on demand', async () => {
    await withStore('delete', (conversations) => {
      const one = conversation(1, '2026-08-20T10:00:00.000Z')
      conversations.saveAll([one, conversation(2, '2026-08-21T10:00:00.000Z')], RUN)

      conversations.delete(one.id)
      expect(conversations.findPage({ cursor: null, limit: 10 }).conversations).toHaveLength(1)

      conversations.deleteAll()
      expect(conversations.findPage({ cursor: null, limit: 10 }).conversations).toHaveLength(0)
    })
  })
})
