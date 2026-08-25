import { startAcpClient } from '@host/infrastructure/acp/client.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import { describe, expect, it } from 'vitest'

function startIdleClient(signal: AbortSignal) {
  return startAcpClient({
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

describe('AcpClient', () => {
  it('stops one request at its deadline', async () => {
    const client = await startIdleClient(new AbortController().signal)
    await expect(
      client.request({ method: 'test', params: {}, timeoutMs: 10 }),
    ).rejects.toMatchObject({ _tag: 'AcpTimeoutError' })
    await client.stop()
  })

  it('does not listen to process signals', async () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')
    const client = await startIdleClient(new AbortController().signal)
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
    await client.stop()
  })

  it('stops when the host signal aborts', async () => {
    const shutdown = new AbortController()
    const client = await startIdleClient(shutdown.signal)
    shutdown.abort()
    await expect(
      client.request({ method: 'test', params: {}, timeoutMs: 50 }),
    ).rejects.toMatchObject({ _tag: 'AcpExitedError' })
  })

  it('does not spawn when the host signal is already aborted', async () => {
    const shutdown = new AbortController()
    shutdown.abort()
    await expect(startIdleClient(shutdown.signal)).rejects.toMatchObject({ _tag: 'AcpStartError' })
  })
})
