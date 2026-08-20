import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  answerIncomingRequest,
  parsePermissionRequest,
} from '@host/adapters/acp/incoming-request.ts'
import { describe, expect, it } from 'vitest'

describe('answerIncomingRequest', () => {
  it('parses a permission request', () => {
    const parsed = parsePermissionRequest({
      sessionId: 'session-1',
      toolCall: { toolCallId: 'tool-1', title: 'Run tests' },
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    })

    expect(parsed.isOk() && parsed.value.options[0]?.optionId).toBe('allow')
  })

  it('writes and reads a text file', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'porte-fs-'))
    const path = join(folder, 'pong.txt')
    const written = await answerIncomingRequest(folder, 'fs/write_text_file', {
      path,
      content: 'pong\n',
    })
    expect(written.isOk()).toBe(true)
    await expect(readFile(path, 'utf8')).resolves.toBe('pong\n')

    const read = await answerIncomingRequest(folder, 'fs/read_text_file', { path })
    expect(read.isOk()).toBe(true)
    if (read.isOk()) {
      expect(read.value).toEqual({ content: 'pong\n' })
    }
  })

  it('rejects an unknown method', async () => {
    const answered = await answerIncomingRequest('/repo', 'terminal/create', {})
    expect(answered.isErr()).toBe(true)
    if (answered.isErr()) {
      expect(answered.error.code).toBe(-32601)
    }
  })

  it('rejects a path outside the conversation directory', async () => {
    const answered = await answerIncomingRequest('/repo', 'fs/read_text_file', {
      path: '/etc/passwd',
    })

    expect(answered.isErr() && answered.error.code).toBe(-32602)
  })
})
