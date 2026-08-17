import type { SessionSummary } from '@lras/core'
import { Result, type Result as ResultType } from 'better-result'

import type {
  AcpRpcError,
  DuplicateSessionError,
  GrokExitedError,
  GrokNotFoundError,
  SessionNotFoundError,
  SessionStoreError,
} from '../errors.ts'
import type { SessionUpdate } from '../grok/acp-message.ts'

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

/** Active agent capability required by the resume operation. */
export interface SessionAgent {
  /** Initialize the agent protocol. */
  initialize(): Promise<ResultType<void, AcpRpcError | GrokExitedError>>

  /** Authenticate with the stored Grok credential. */
  authenticate(): Promise<ResultType<void, AcpRpcError | GrokExitedError>>

  /** Load one existing Grok session. */
  load(sessionId: string, cwd: string): Promise<ResultType<void, AcpRpcError | GrokExitedError>>

  /** Send one prompt to the loaded session. */
  prompt(
    sessionId: string,
    prompt: string,
  ): Promise<ResultType<void, AcpRpcError | GrokExitedError>>

  /** Stop the active agent process. */
  stop(): Promise<void>
}

/** Agent process capability required to start a resume operation. */
export interface SessionAgentStarter {
  /** Start an agent in the session working directory. */
  start(
    cwd: string,
    onUpdate: (update: SessionUpdate) => void,
  ): Promise<ResultType<SessionAgent, GrokNotFoundError>>
}

/** Failures from `lras resume`. */
export type ResumeFailure =
  | SessionNotFoundError
  | DuplicateSessionError
  | SessionStoreError
  | GrokNotFoundError
  | AcpRpcError
  | GrokExitedError

/** Loads a stored session and sends one prompt through an agent. */
export class SessionResumer {
  constructor(
    private readonly sessions: SessionFinder,
    private readonly agents: SessionAgentStarter,
  ) {}

  /** Resume one session and publish its parsed updates. */
  async resume(
    sessionId: string,
    prompt: string,
    onUpdate: (update: SessionUpdate) => void,
  ): Promise<ResultType<void, ResumeFailure>> {
    const found = await this.sessions.find(sessionId)
    if (found.isErr()) return Result.err(found.error)

    const started = await this.agents.start(found.value.summary.cwd, onUpdate)
    if (started.isErr()) return Result.err(started.error)

    const agent = started.value
    try {
      const initialized = await agent.initialize()
      if (initialized.isErr()) return Result.err(initialized.error)

      const authenticated = await agent.authenticate()
      if (authenticated.isErr()) return Result.err(authenticated.error)

      const loaded = await agent.load(found.value.summary.id, found.value.summary.cwd)
      if (loaded.isErr()) return Result.err(loaded.error)

      const prompted = await agent.prompt(found.value.summary.id, prompt)
      if (prompted.isErr()) return Result.err(prompted.error)

      return Result.ok()
    } finally {
      await agent.stop()
    }
  }
}
