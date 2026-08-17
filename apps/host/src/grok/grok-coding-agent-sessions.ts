import { Result, type Result as ResultType } from 'better-result'

import type { AcpClient, StartAcpClient } from '../acp/acp-client.ts'
import type {
  AcpExitedError,
  AcpRpcError,
  AcpStartError,
  AcpTransportError,
} from '../acp/acp-errors.ts'
import { answerIncomingRequest } from '../acp/acp-incoming.ts'
import {
  type CodingAgentSessions,
  CodingAgentResumeError,
  type ResumeCodingAgentSession,
} from '../sessions/coding-agent-sessions.ts'

type AcpSession = Pick<AcpClient, 'request' | 'stop'>
type AcpClients = {
  readonly start: (input: StartAcpClient) => Promise<ResultType<AcpSession, AcpStartError>>
}

type GrokAcpRequest =
  | {
      readonly method: 'initialize'
      readonly params: {
        readonly protocolVersion: 1
        readonly clientCapabilities: {
          readonly fs: { readonly readTextFile: true; readonly writeTextFile: true }
        }
      }
    }
  | {
      readonly method: 'authenticate'
      readonly params: {
        readonly methodId: 'cached_token'
        readonly _meta: { readonly headless: true }
      }
    }
  | {
      readonly method: 'session/load'
      readonly params: {
        readonly sessionId: string
        readonly cwd: string
        readonly mcpServers: readonly []
      }
    }
  | {
      readonly method: 'session/prompt'
      readonly params: {
        readonly sessionId: string
        readonly prompt: readonly [{ readonly type: 'text'; readonly text: string }]
      }
    }

/** Resumes Grok sessions through Grok's ACP process. */
export class GrokCodingAgentSessions implements CodingAgentSessions {
  constructor(private readonly clients: AcpClients) {}

  /** Start Grok, load one session, and send one prompt. */
  async resume(
    command: ResumeCodingAgentSession,
  ): Promise<ResultType<void, CodingAgentResumeError>> {
    const started = await this.clients.start({
      command: 'grok',
      args: ['--no-auto-update', 'agent', 'stdio'],
      cwd: command.cwd,
      onUpdate: command.onEvent,
      onRequest: answerIncomingRequest,
    })
    if (started.isErr()) {
      return Result.err(
        new CodingAgentResumeError({
          agentName: 'Grok',
          cause: started.error,
          message: 'Grok could not start. Check its installation and PATH.',
        }),
      )
    }

    const client = started.value
    try {
      for (const request of requestsFor(command)) {
        // oxlint-disable-next-line no-await-in-loop -- ACP requests must complete in protocol order.
        const response = await client.request(request)
        if (response.isErr()) return Result.err(mapAcpError(response.error))
      }
      return Result.ok()
    } finally {
      await client.stop()
    }
  }
}

function requestsFor(command: ResumeCodingAgentSession): readonly GrokAcpRequest[] {
  return [
    {
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      },
    },
    {
      method: 'authenticate',
      params: { methodId: 'cached_token', _meta: { headless: true } },
    },
    {
      method: 'session/load',
      params: { sessionId: command.sessionId, cwd: command.cwd, mcpServers: [] },
    },
    {
      method: 'session/prompt',
      params: { sessionId: command.sessionId, prompt: [{ type: 'text', text: command.prompt }] },
    },
  ]
}

function mapAcpError(
  error: AcpRpcError | AcpExitedError | AcpTransportError,
): CodingAgentResumeError {
  if (error._tag === 'AcpRpcError') {
    return new CodingAgentResumeError({
      agentName: 'Grok',
      cause: error,
      message: `Grok could not resume the session: ${error.message}`,
    })
  }
  if (error._tag === 'AcpTransportError') {
    return new CodingAgentResumeError({
      agentName: 'Grok',
      cause: error,
      message: 'The connection to Grok failed.',
    })
  }
  return new CodingAgentResumeError({
    agentName: 'Grok',
    cause: error,
    message: `Grok exited ${String(error.code)}. The session files stay on disk.`,
  })
}
