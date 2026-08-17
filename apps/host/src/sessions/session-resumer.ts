import type { SessionSummary } from '@lras/core'
import { Result, type Result as ResultType } from 'better-result'

import type { DuplicateSessionError, SessionNotFoundError, SessionStoreError } from '../errors.ts'
import type {
  CodingAgentSessions,
  CodingAgentResumeError,
  ProviderSessionEvent,
} from './coding-agent-sessions.ts'

type ResumableSession = {
  readonly summary: SessionSummary
}

/** Stored session capability required to resume one session. */
export interface SessionFinder {
  /** Find one session by its public id. */
  find(
    sessionId: string,
  ): Promise<
    ResultType<ResumableSession, SessionNotFoundError | DuplicateSessionError | SessionStoreError>
  >
}

/** Failures from `lras resume`. */
export type ResumeFailure =
  | SessionNotFoundError
  | DuplicateSessionError
  | SessionStoreError
  | CodingAgentResumeError

/** Loads a stored session and sends one prompt through an agent. */
export class SessionResumer {
  constructor(
    private readonly sessions: SessionFinder,
    private readonly agents: CodingAgentSessions,
  ) {}

  /** Resume one session and publish its parsed updates. */
  async resume(
    sessionId: string,
    prompt: string,
    onEvent: (event: ProviderSessionEvent) => void,
  ): Promise<ResultType<void, ResumeFailure>> {
    const found = await this.sessions.find(sessionId)
    if (found.isErr()) return Result.err(found.error)

    return this.agents.resume({
      sessionId: found.value.summary.id,
      cwd: found.value.summary.cwd,
      prompt,
      onEvent,
    })
  }
}
