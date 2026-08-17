import { Result, type Result as ResultType } from 'better-result'

import type { AcpRpcError, GrokExitedError, GrokNotFoundError } from '../errors.ts'
import type { SessionAgent, SessionAgentStarter } from '../sessions/session-resumer.ts'
import { AcpClient } from './acp-client.ts'
import type { AcpRequest, SessionUpdate } from './acp-message.ts'

/** Starts Grok agent processes that implement the session agent port. */
export class GrokSessionAgentStarter implements SessionAgentStarter {
  /** Start `grok agent stdio` in the specified directory. */
  async start(
    cwd: string,
    onUpdate: (update: SessionUpdate) => void,
  ): Promise<ResultType<SessionAgent, GrokNotFoundError>> {
    const started = await AcpClient.start(cwd, onUpdate)
    if (started.isErr()) return Result.err(started.error)
    return Result.ok(new GrokSessionAgent(started.value))
  }
}

class GrokSessionAgent implements SessionAgent {
  constructor(private readonly client: AcpClient) {}

  initialize(): Promise<ResultType<void, AcpRpcError | GrokExitedError>> {
    return this.request({
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      },
    })
  }

  authenticate(): Promise<ResultType<void, AcpRpcError | GrokExitedError>> {
    return this.request({
      method: 'authenticate',
      params: { methodId: 'cached_token', _meta: { headless: true } },
    })
  }

  load(sessionId: string, cwd: string): Promise<ResultType<void, AcpRpcError | GrokExitedError>> {
    return this.request({ method: 'session/load', params: { sessionId, cwd, mcpServers: [] } })
  }

  prompt(
    sessionId: string,
    prompt: string,
  ): Promise<ResultType<void, AcpRpcError | GrokExitedError>> {
    return this.request({
      method: 'session/prompt',
      params: { sessionId, prompt: [{ type: 'text', text: prompt }] },
    })
  }

  stop(): Promise<void> {
    return this.client.stop()
  }

  private async request(
    request: AcpRequest,
  ): Promise<ResultType<void, AcpRpcError | GrokExitedError>> {
    const result = await this.client.request(request)
    if (result.isErr()) return Result.err(result.error)
    return Result.ok()
  }
}
