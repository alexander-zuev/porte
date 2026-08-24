import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ConversationCreationClaim,
  ConversationCreationRecord,
  ConversationCreationStore,
  ConversationCreationStoreError,
} from '@host/application/ports/conversation-creation-store.ts'
import { ConversationCreationIdSchema, ConversationSchema } from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const FILE_NAME = 'conversation-creations.json'
const PendingCreationSchema = z.strictObject({
  status: z.literal('pending'),
  creationId: ConversationCreationIdSchema,
  cwd: z.string().min(1),
})
const CompletedCreationSchema = z.strictObject({
  status: z.literal('completed'),
  creationId: ConversationCreationIdSchema,
  cwd: z.string().min(1),
  conversation: ConversationSchema,
})
const StoredCreationSchema = z.discriminatedUnion('status', [
  PendingCreationSchema,
  CompletedCreationSchema,
])
type StoredCreation = z.infer<typeof StoredCreationSchema>
const LegacyCreationSchema = z
  .strictObject({
    creationId: ConversationCreationIdSchema,
    cwd: z.string().min(1),
    conversation: ConversationSchema,
  })
  .transform((record): StoredCreation => ({ status: 'completed', ...record }))
const StoreSchema = z.strictObject({
  records: z.array(z.union([StoredCreationSchema, LegacyCreationSchema])),
})

/** Store conversation creation results in one atomic JSON file. */
export class FileConversationCreationStore implements ConversationCreationStore {
  private readonly filePath: string
  private records: Map<string, StoredCreation> | undefined
  private writes: Promise<void> = Promise.resolve()

  constructor(dataDirectory: string) {
    this.filePath = join(dataDirectory, FILE_NAME)
  }

  async claim(
    creationId: ConversationCreationRecord['creationId'],
    cwd: string,
  ): Promise<ResultType<ConversationCreationClaim, ConversationCreationStoreError>> {
    const loaded = await this.load()
    if (loaded.isErr()) return loaded
    const write = this.writes.then(async () => {
      const next = new Map(this.records ?? loaded.value)
      const current = next.get(creationId)
      if (current?.status === 'completed') {
        return { status: 'completed', record: current } satisfies ConversationCreationClaim
      }
      if (current?.status === 'pending') {
        return { status: 'pending', cwd: current.cwd } satisfies ConversationCreationClaim
      }
      next.set(creationId, { status: 'pending', creationId, cwd })
      await persist(this.filePath, [...next.values()])
      this.records = next
      return { status: 'claimed' } satisfies ConversationCreationClaim
    })
    this.writes = write.then(
      () => undefined,
      () => undefined,
    )
    try {
      return Result.ok(await write)
    } catch (cause) {
      return Result.err(new ConversationCreationStoreError({ cause }))
    }
  }

  async complete(
    record: ConversationCreationRecord,
  ): Promise<ResultType<void, ConversationCreationStoreError>> {
    const loaded = await this.load()
    if (loaded.isErr()) return loaded
    const write = this.writes.then(async () => {
      const next = new Map(this.records ?? loaded.value)
      next.set(record.creationId, { status: 'completed', ...record })
      await persist(this.filePath, [...next.values()])
      this.records = next
      return undefined
    })
    this.writes = write.catch(() => undefined)
    try {
      await write
      return Result.ok()
    } catch (cause) {
      return Result.err(new ConversationCreationStoreError({ cause }))
    }
  }

  private async load(): Promise<
    ResultType<Map<string, StoredCreation>, ConversationCreationStoreError>
  > {
    if (this.records !== undefined) return Result.ok(this.records)
    try {
      const contents = await readFile(this.filePath, 'utf8')
      const parsed = StoreSchema.parse(JSON.parse(contents))
      this.records = new Map(parsed.records.map((record) => [record.creationId, record]))
      return Result.ok(this.records)
    } catch (cause) {
      if (!isMissing(cause)) return Result.err(new ConversationCreationStoreError({ cause }))
      this.records = new Map()
      return Result.ok(this.records)
    }
  }
}

async function persist(filePath: string, records: readonly StoredCreation[]) {
  const temporaryPath = `${filePath}.tmp`
  await mkdir(dirname(filePath), { recursive: true, mode: DIRECTORY_MODE })
  await writeFile(temporaryPath, JSON.stringify({ records }), { encoding: 'utf8', mode: FILE_MODE })
  await rename(temporaryPath, filePath)
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}
