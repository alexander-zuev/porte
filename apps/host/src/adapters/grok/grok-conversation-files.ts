import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { makeSessionSummary, type SessionSummary } from '@porte/core'
import { Result, TaggedError, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { grokSummaryFileSchema } from './grok-summary.ts'

const errnoSchema = z.object({ code: z.string() })

/** One conversation found in Grok's local files. */
export type GrokStoredConversation = {
  readonly summary: SessionSummary
  readonly folderPath: string
}

/** Grok's conversation files could not be read. */
export class GrokConversationFilesError extends TaggedError('GrokConversationFilesError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'Grok conversation files are unavailable' })
  }
}

/** No Grok conversation matched the requested identifier. */
export class GrokConversationNotFoundError extends TaggedError('GrokConversationNotFoundError')<{
  conversationId: string
  message: string
}> {
  constructor(args: { conversationId: string }) {
    super({ ...args, message: `conversation not found: ${args.conversationId}` })
  }
}

/** More than one Grok conversation has the requested identifier. */
export class DuplicateGrokConversationError extends TaggedError('DuplicateGrokConversationError')<{
  conversationId: string
  folderPaths: readonly string[]
  message: string
}> {
  constructor(args: { conversationId: string; folderPaths: readonly string[] }) {
    super({ ...args, message: args.folderPaths.join('\n') })
  }
}

/** Read Grok conversations from its provider-owned disk format. */
export async function listGrokConversations(
  grokHome: string,
): Promise<ResultType<GrokStoredConversation[], GrokConversationFilesError>> {
  try {
    return Result.ok(await listFromDisk(grokHome))
  } catch (cause) {
    return Result.err(new GrokConversationFilesError({ cause }))
  }
}

/** Find one Grok conversation in its provider-owned disk format. */
export async function findGrokConversation(
  grokHome: string,
  conversationId: string,
): Promise<
  ResultType<
    GrokStoredConversation,
    GrokConversationNotFoundError | DuplicateGrokConversationError | GrokConversationFilesError
  >
> {
  const listed = await listGrokConversations(grokHome)
  if (listed.isErr()) return Result.err(listed.error)

  const matches = listed.value.filter((entry) => entry.summary.id === conversationId)
  const first = matches[0]
  if (first === undefined) {
    return Result.err(new GrokConversationNotFoundError({ conversationId }))
  }
  if (matches.length > 1) {
    return Result.err(
      new DuplicateGrokConversationError({
        conversationId,
        folderPaths: matches.map((entry) => entry.folderPath),
      }),
    )
  }
  return Result.ok(first)
}

async function listFromDisk(grokHome: string): Promise<GrokStoredConversation[]> {
  const sessionsRoot = join(grokHome, 'sessions')
  const groups = await readDirNames(sessionsRoot)
  if (groups === undefined) return []

  const listed: GrokStoredConversation[] = []
  for (const group of groups) {
    const groupPath = join(sessionsRoot, group)
    // oxlint-disable-next-line no-await-in-loop -- Sequential reads bound open file descriptors.
    const directories = await readDirNames(groupPath)
    if (directories === undefined) continue

    for (const directory of directories) {
      const folderPath = join(groupPath, directory)
      // oxlint-disable-next-line no-await-in-loop -- Sequential reads bound open file descriptors.
      const summary = await readSummary(folderPath, group)
      if (summary !== undefined) listed.push({ summary, folderPath })
    }
  }

  listed.sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt))
  return listed
}

async function readDirNames(path: string): Promise<string[] | undefined> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (cause) {
    const parsed = errnoSchema.safeParse(cause)
    if (parsed.success && parsed.data.code === 'ENOENT') return undefined
    throw cause
  }
}

async function readSummary(
  folderPath: string,
  encodedCwd: string,
): Promise<SessionSummary | undefined> {
  let raw: string
  try {
    raw = await readFile(join(folderPath, 'summary.json'), 'utf8')
  } catch (cause) {
    const parsed = errnoSchema.safeParse(cause)
    if (parsed.success && parsed.data.code === 'ENOENT') return undefined
    throw cause
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return undefined
  }

  const parsed = grokSummaryFileSchema.safeParse(json)
  if (!parsed.success || parsed.data.session_kind === 'subagent') return undefined

  const cwd = resolveCwd(parsed.data.info.cwd, encodedCwd)
  const updatedAt = parsed.data.last_active_at ?? parsed.data.updated_at
  if (cwd === undefined || updatedAt === undefined || updatedAt.length === 0) return undefined

  const generated = parsed.data.generated_title
  const fallback = parsed.data.session_summary
  return makeSessionSummary({
    id: parsed.data.info.id,
    cwd,
    title: generated !== undefined && generated.length > 0 ? generated : (fallback ?? ''),
    updatedAt,
  })
}

function resolveCwd(infoCwd: string | undefined, encodedCwd: string): string | undefined {
  if (infoCwd !== undefined && infoCwd.length > 0) return infoCwd
  try {
    const decoded = decodeURIComponent(encodedCwd)
    return decoded.length > 0 ? decoded : undefined
  } catch {
    return undefined
  }
}
