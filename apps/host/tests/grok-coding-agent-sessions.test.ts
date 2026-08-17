import { Result, type Result as ResultType } from 'better-result'
import { describe, expect, it } from 'vitest'

import {
  AcpExitedError,
  AcpRpcError,
  AcpStartError,
  AcpTransportError,
} from '../src/acp/acp-errors.ts'
import type { AcpRequest, JsonValue } from '../src/acp/acp-message.ts'
import { GrokCodingAgentSessions } from '../src/grok/grok-coding-agent-sessions.ts'

describe('GrokCodingAgentSessions', () => {
  it('owns the Grok ACP sequence and cleanup', async () => {
    const { agent, calls } = makeAgent()

    const result = await agent.resume(command())

    expect(result.isOk()).toBe(true)
    expect(calls).toEqual(['initialize', 'authenticate', 'session/load', 'session/prompt', 'stop'])
  })

  it('maps an ACP failure and stops the process', async () => {
    const error = new AcpRpcError({ rpc: { code: 1, message: 'denied' } })
    const { agent, calls } = makeAgent('authenticate', error)

    const result = await agent.resume(command())

    expect(result.isErr() && result.error._tag).toBe('CodingAgentResumeError')
    expect(calls).toEqual(['initialize', 'authenticate', 'stop'])
  })

  it('maps an ACP start failure', async () => {
    const clients = {
      start: async () => Result.err(new AcpStartError({ cause: 'missing' })),
    }

    const result = await new GrokCodingAgentSessions(clients).resume(command())

    expect(result.isErr() && result.error._tag).toBe('CodingAgentResumeError')
  })
})

function makeAgent(failedMethod?: string, error?: AcpRpcError) {
  const calls: string[] = []
  const client = {
    request: async ({
      method,
    }: AcpRequest): Promise<
      ResultType<JsonValue | undefined, AcpRpcError | AcpExitedError | AcpTransportError>
    > => {
      calls.push(method)
      return method === failedMethod && error !== undefined
        ? Result.err(error)
        : Result.ok(undefined)
    },
    stop: async () => {
      calls.push('stop')
    },
  }
  const clients = { start: async () => Result.ok(client) }
  return { agent: new GrokCodingAgentSessions(clients), calls }
}

function command() {
  return {
    sessionId: 'session-1',
    cwd: '/repo',
    prompt: 'continue',
    onEvent: () => undefined,
  }
}
