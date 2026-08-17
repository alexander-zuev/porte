import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { makeSessionSummary, type SessionSummary } from '@lras/core'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { DuplicateSessionError, SessionNotFoundError } from '../errors.ts'
import { grokSummaryFileSchema } from './grok-summary.ts'

const errnoSchema = z.object({
  code: z.string(),
})

/** A listed session plus the folder it was read from. */
export type ListedSession = {
  readonly summary: SessionSummary
  readonly folderPath: string
}

/** Reads `GROK_HOME/sessions` and finds a row by id. */
export class SessionStore {
  constructor(private readonly grokHome: string) {}

  /**
   * List non-subagent sessions, newest first.
   */
  async list(): Promise<ListedSession[]> {
    const sessionsRoot = join(this.grokHome, 'sessions')
    const groups = await readDirNames(sessionsRoot)
    if (groups === undefined) {
      return []
    }

    const listed: ListedSession[] = []
    for (const group of groups) {
      const groupPath = join(sessionsRoot, group)
      const sessionDirs = await readDirNames(groupPath)
      if (sessionDirs === undefined) {
        continue
      }
      for (const sessionDir of sessionDirs) {
        const folderPath = join(groupPath, sessionDir)
        const mapped = await mapSummaryFile(folderPath, group)
        if (mapped !== undefined) {
          listed.push({ summary: mapped, folderPath })
        }
      }
    }

    listed.sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt))
    return listed
  }

  /**
   * Find one session by id.
   *
   * @param sessionId - Session id from the CLI.
   */
  async find(
    sessionId: string,
  ): Promise<ResultType<ListedSession, SessionNotFoundError | DuplicateSessionError>> {
    const matches = (await this.list()).filter((session) => session.summary.id === sessionId)
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
  } catch {
    return undefined
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return undefined
  }

  const parsed = grokSummaryFileSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return undefined
  }
  if (parsed.data.session_kind === 'subagent') {
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
