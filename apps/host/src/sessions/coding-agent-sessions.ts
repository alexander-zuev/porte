import { TaggedError, type Result } from 'better-result'

/** A coding agent could not resume the requested session. */
export class CodingAgentResumeError extends TaggedError('CodingAgentResumeError')<{
  agentName: string
  cause: unknown
  message: string
}> {}

/** A JSON value in an opaque provider event. */
export type ProviderEventValue =
  | string
  | number
  | boolean
  | null
  | readonly ProviderEventValue[]
  | { readonly [key: string]: ProviderEventValue }

/** One opaque provider event forwarded by the CLI. */
export type ProviderSessionEvent = {
  readonly [key: string]: ProviderEventValue
}

/** Input required to resume one local coding-agent session. */
export type ResumeCodingAgentSession = {
  readonly sessionId: string
  readonly cwd: string
  readonly prompt: string
  readonly onEvent: (event: ProviderSessionEvent) => void
}

/** Local coding-agent capability required by session resume. */
export interface CodingAgentSessions {
  /** Resume one session and send one prompt. */
  resume(command: ResumeCodingAgentSession): Promise<Result<void, CodingAgentResumeError>>
}
