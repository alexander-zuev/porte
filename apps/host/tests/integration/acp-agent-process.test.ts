import { AcpAgentProcess } from '@host/infrastructure/acp/acp-agent-process.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import { describe, expect, it } from 'vitest'

function startIdleTransport(signal: AbortSignal) {
  return AcpAgentProcess.start({
    command: process.execPath,
    args: ['-e', 'process.stdin.resume()'],
    cwd: process.cwd(),
    signal,
    onUpdate: () => undefined,
    onRequest: async () => {
      throw new AcpClientRequestError({ code: -32601, message: 'method not found' })
    },
  })
}

describe('AcpAgentProcess', () => {
  it('stops one request at its deadline', async () => {
    const transport = await startIdleTransport(new AbortController().signal)
    await expect(
      transport.request({ method: 'test', params: {}, timeoutMs: 10 }),
    ).rejects.toMatchObject({ _tag: 'AcpTimeoutError' })
    await transport.stop()
  })

  it('does not listen to process signals', async () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')
    const transport = await startIdleTransport(new AbortController().signal)
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
    await transport.stop()
  })

  it('stops when the host signal aborts', async () => {
    const shutdown = new AbortController()
    const transport = await startIdleTransport(shutdown.signal)
    shutdown.abort()
    await expect(
      transport.request({ method: 'test', params: {}, timeoutMs: 50 }),
    ).rejects.toMatchObject({ _tag: 'AcpExitedError' })
  })

  it('does not spawn when the host signal is already aborted', async () => {
    const shutdown = new AbortController()
    shutdown.abort()
    await expect(startIdleTransport(shutdown.signal)).rejects.toMatchObject({
      _tag: 'AcpStartError',
    })
  })
})
