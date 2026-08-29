import { PassThrough } from 'node:stream'

import { createOutput } from '@host/entrypoints/cli/output.ts'
import { reportRelayStatus } from '@host/entrypoints/cli/run-up-command.ts'
import { describe, expect, it } from 'vitest'

function capture() {
  const stream = new PassThrough()
  let text = ''
  stream.on('data', (chunk: Buffer) => {
    text += chunk.toString()
  })
  return { output: createOutput(stream), lines: () => text.split('\n').filter(Boolean) }
}

describe('porte up status lines', () => {
  it('connects, drops with the cause, retries, and reconnects', () => {
    const { output, lines } = capture()
    const report = reportRelayStatus(output, 'https://useporte.dev')
    report({ type: 'connecting' })
    report({ type: 'connected', attempt: 0 })
    report({ type: 'reconnecting', attempt: 1, cause: 'server-unreachable' })
    report({ type: 'reconnecting', attempt: 2, cause: 'server-unreachable' })
    report({ type: 'connected', attempt: 2 })
    expect(lines()).toEqual([
      'Connecting to useporte.dev…',
      '✓ Connected. Open https://useporte.dev/conversations',
      '! Porte is unreachable. Retrying (attempt 1)…',
      '! Porte is unreachable. Retrying (attempt 2)…',
      '✓ Reconnected.',
    ])
  })
})
