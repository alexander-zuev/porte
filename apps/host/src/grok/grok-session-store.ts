import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { makeSessionSummary, type SessionSummary } from '@lras/core'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { DuplicateSessionError, SessionNotFoundError, SessionStoreError } from '../errors.ts'
import { grokSummaryFileSchema } from './grok-summary.ts'

const errnoSchema = z.object({
  code: z.string(),
})

/** A Grok session plus the folder that contains it. */
export type GrokStoredSession = {
  readonly summary: SessionSummary
  readonly folderPath: string
}

/** Reads sessions from Grok's local storage format. */
export class GrokSessionStore {
  constructor(private readonly grokHome: string) {}

  /** List non-subagent sessions, newest first. */
  async list(): Promise<ResultType<GrokStoredSession[], SessionStoreError>> {
    try {
      return Result.ok(await this.listFromDisk())
    } catch (cause) {
      return Result.err(new SessionStoreError({ operation: 'list', cause }))
    }
  }

  /** Find one Grok session by its public id. */
  async find(
    sessionId: string,
  ): Promise<
    ResultType<GrokStoredSession, SessionNotFoundError | DuplicateSessionError | SessionStoreError>
  > {
    const listed = await this.list()
    if (listed.isErr()) return Result.err(listed.error)

    const matches = listed.value.filter((session) => session.summary.id === sessionId)
    const first = matches[0]
    if (first === undefined) {
      return Result.err(new SessionNotFoundError({ sessionId }))
    }
    if (matches.length > 1) {
      return Result.err(
        new DuplicateSessionError({
          sessionId,
          folderPaths: matches.map((session) => session.folderPath),
        }),
      )
    }
    return Result.ok(first)
  }

  private async listFromDisk(): Promise<GrokStoredSession[]> {
    const sessionsRoot = join(this.grokHome, 'sessions')
    const groups = await readDirNames(sessionsRoot)
    if (groups === undefined) {
      return []
    }

    const listed: GrokStoredSession[] = []
    for (const group of groups) {
      const groupPath = join(sessionsRoot, group)
      // oxlint-disable-next-line no-await-in-loop -- Sequential reads bound open file descriptors.
      const sessionDirs = await readDirNames(groupPath)
      if (sessionDirs === undefined) {
        continue
      }
      for (const sessionDir of sessionDirs) {
        const folderPath = join(groupPath, sessionDir)
        // oxlint-disable-next-line no-await-in-loop -- Sequential reads bound open file descriptors.
        const summary = await mapSummaryFile(folderPath, group)
        if (summary !== undefined) {
          listed.push({ summary, folderPath })
        }
      }
    }

    listed.sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt))
    return listed
  }
}

async function readDirNames(path: string): Promise<string[] | undefined> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (cause) {
    const parsed = errnoSchema.safeParse(cause)
    if (parsed.success && parsed.data.code === 'ENOENT') {
      return undefined
    }
    throw cause
  }
}

async function mapSummaryFile(
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

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return undefined
  }

  const parsed = grokSummaryFileSchema.safeParse(parsedJson)
  if (!parsed.success || parsed.data.session_kind === 'subagent') {
    return undefined
  }

  const cwd = resolveCwd(parsed.data.info.cwd, encodedCwd)
  const updatedAt = parsed.data.last_active_at ?? parsed.data.updated_at
  if (cwd === undefined || updatedAt === undefined || updatedAt.length === 0) {
    return undefined
  }

  const generated = parsed.data.generated_title
  const fallback = parsed.data.session_summary
  const title = generated !== undefined && generated.length > 0 ? generated : (fallback ?? '')

  return makeSessionSummary({
    id: parsed.data.info.id,
    cwd,
    title,
    updatedAt,
  })
}

function resolveCwd(infoCwd: string | undefined, encodedCwd: string): string | undefined {
  if (infoCwd !== undefined && infoCwd.length > 0) {
    return infoCwd
  }
  try {
    const decoded = decodeURIComponent(encodedCwd)
    return decoded.length > 0 ? decoded : undefined
  } catch {
    return undefined
  }
}
