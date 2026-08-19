import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { startAcpClient } from '../../src/adapters/acp/client.ts'

describe('AcpClient', () => {
  it('stops one request at its deadline', async () => {
    const started = await startAcpClient({
      command: process.execPath,
      args: ['-e', 'process.stdin.resume()'],
      cwd: process.cwd(),
      onUpdate: () => undefined,
      onRequest: async () => Result.err({ code: -32601, message: 'method not found' }),
    })
    expect(started.isOk()).toBe(true)
    if (started.isErr()) return

    const result = await started.value.request({ method: 'test', params: {}, timeoutMs: 10 })
    expect(result.isErr() && result.error._tag).toBe('AcpTimeoutError')
    await started.value.stop()
  })
})
