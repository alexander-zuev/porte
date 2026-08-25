import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import {
  answerIncomingRequest,
  parsePermissionRequest,
} from '@host/infrastructure/acp/incoming-request.ts'
import { describe, expect, it } from 'vitest'

describe('answerIncomingRequest', () => {
  it('parses a permission request', () => {
    const parsed = parsePermissionRequest({
      sessionId: 'session-1',
      toolCall: { toolCallId: 'tool-1', title: 'Run tests' },
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    })

    expect(parsed.options[0]?.optionId).toBe('allow')
  })

  it('writes and reads a text file', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'porte-fs-'))
    const path = join(folder, 'pong.txt')
    await answerIncomingRequest(folder, 'fs/write_text_file', {
      path,
      content: 'pong\n',
    })
    await expect(readFile(path, 'utf8')).resolves.toBe('pong\n')

    await expect(answerIncomingRequest(folder, 'fs/read_text_file', { path })).resolves.toEqual({
      content: 'pong\n',
    })
  })

  it('rejects an unknown method', async () => {
    await expect(answerIncomingRequest('/repo', 'terminal/create', {})).rejects.toMatchObject({
      code: -32601,
    })
    await expect(answerIncomingRequest('/repo', 'terminal/create', {})).rejects.toBeInstanceOf(
      AcpClientRequestError,
    )
  })

  it('rejects a path outside the conversation directory', async () => {
    await expect(
      answerIncomingRequest('/repo', 'fs/read_text_file', { path: '/etc/passwd' }),
    ).rejects.toMatchObject({ code: -32602 })
  })
})
