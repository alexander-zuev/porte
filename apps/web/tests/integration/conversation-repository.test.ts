import {
  LIST_CONVERSATIONS_LIMIT_DEFAULT,
  IsoDateTimeSchema,
  createHostId,
  type ConversationId,
  type ConversationSummary,
} from '@porte/core'
import { createRelayDatabase } from '@server/infrastructure/persistence/relay/connection.ts'
import { DrizzleConversationRepository } from '@server/infrastructure/persistence/repositories/conversation.repository.ts'
import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

/**
 * The repository over one relay's real storage.
 *
 * The relay itself has already migrated by the time this runs: its constructor
 * does that under `blockConcurrencyWhile`, which is what makes this the schema
 * a deployed relay actually has.
 */
async function withStore(
  _name: string,
  body: (conversations: DrizzleConversationRepository) => void,
) {
  // `wrangler types` unions every environment, so every binding is optional in
  // that type. Checked rather than asserted, so a missing binding says so.
  const relays = env.HOST_RELAY_AGENT
  if (relays === undefined) throw new Error('HOST_RELAY_AGENT is not bound in the test environment')

  const stub = relays.get(relays.idFromName(createHostId()))
  await runInDurableObject(stub, (_relay, state) => {
    body(new DrizzleConversationRepository(createRelayDatabase(state.storage)))
  })
}

function conversation(index: number, at: string): ConversationSummary {
  return {
    id: `01a0292c-0000-7000-8000-${String(index).padStart(12, '0')}` as ConversationId,
    cwd: '/Users/az/projects/porte',
    gitRoot: '/Users/az/projects/porte',
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
      conversations.saveAll([conversation(1, '2026-08-20T10:00:00.000Z')])

      const page = conversations.findList({ limit: LIST_CONVERSATIONS_LIMIT_DEFAULT })
      expect(page.conversations).toHaveLength(1)
      expect(page.conversations[0]?.title).toBe('conversation 1')
      expect(page.conversations[0]?.updatedAt).toBe('2026-08-20T10:00:00.000Z')
      expect(page.next).toBeUndefined()
    })
  })

  it('orders newest first', async () => {
    await withStore('order', (conversations) => {
      conversations.saveAll([
        conversation(1, '2026-08-20T10:00:00.000Z'),
        conversation(2, '2026-08-22T10:00:00.000Z'),
        conversation(3, '2026-08-21T10:00:00.000Z'),
      ])

      const page = conversations.findList({ limit: 10 })
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
      conversations.saveAll(all)

      const seen: string[] = []
      let cursor: ReturnType<typeof conversations.findList>['next']
      do {
        const page = conversations.findList(
          cursor === undefined ? { limit: 3 } : { cursor, limit: 3 },
        )
        seen.push(...page.conversations.map((one) => one.id))
        cursor = page.next
      } while (cursor !== undefined)

      expect(seen).toHaveLength(7)
      expect(new Set(seen).size).toBe(7)
    })
  })

  it('breaks a tie on updatedAt with the id, so a cursor never repeats a row', async () => {
    await withStore('ties', (conversations) => {
      const sameMoment = '2026-08-20T10:00:00.000Z'
      conversations.saveAll([
        conversation(1, sameMoment),
        conversation(2, sameMoment),
        conversation(3, sameMoment),
      ])

      const first = conversations.findList({ limit: 2 })
      if (first.next === undefined) throw new Error('Expected a second page')
      const second = conversations.findList({ cursor: first.next, limit: 2 })
      const ids = [...first.conversations, ...second.conversations].map((one) => one.id)

      expect(new Set(ids).size).toBe(3)
    })
  })

  it('replaces the complete cache', async () => {
    await withStore('replace', (conversations) => {
      conversations.saveAll([
        conversation(1, '2026-08-20T10:00:00.000Z'),
        conversation(2, '2026-08-21T10:00:00.000Z'),
      ])
      conversations.replaceAll([conversation(1, '2026-08-22T10:00:00.000Z')])

      const page = conversations.findList({ limit: 10 })
      expect(page.conversations.map((one) => one.title)).toEqual(['conversation 1'])
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

      conversations.saveAll(all)

      expect(conversations.findList({ limit: 1000 }).conversations).toHaveLength(500)
    })
  })

  it('deletes one, and empties on demand', async () => {
    await withStore('delete', (conversations) => {
      const one = conversation(1, '2026-08-20T10:00:00.000Z')
      conversations.saveAll([one, conversation(2, '2026-08-21T10:00:00.000Z')])

      conversations.delete(one.id)
      expect(conversations.findList({ limit: 10 }).conversations).toHaveLength(1)

      conversations.deleteAll()
      expect(conversations.findList({ limit: 10 }).conversations).toHaveLength(0)
    })
  })
})
