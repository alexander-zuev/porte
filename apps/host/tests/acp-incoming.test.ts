import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { answerIncomingRequest, selectAllowOnce } from '../src/acp/acp-incoming.ts'

describe('answerIncomingRequest', () => {
  it('selects allow_once', () => {
    expect(
      selectAllowOnce({
        options: [
          { optionId: 'reject', kind: 'reject_once' },
          { optionId: 'allow', kind: 'allow_once' },
        ],
      }),
    ).toBe('allow')
  })

  it('writes and reads a text file', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'porte-fs-'))
    const path = join(folder, 'pong.txt')
    const written = await answerIncomingRequest('fs/write_text_file', { path, content: 'pong\n' })
    expect(written.isOk()).toBe(true)
    await expect(readFile(path, 'utf8')).resolves.toBe('pong\n')

    const read = await answerIncomingRequest('fs/read_text_file', { path })
    expect(read.isOk()).toBe(true)
    if (read.isOk()) {
      expect(read.value).toEqual({ content: 'pong\n' })
    }
  })

  it('rejects an unknown method', async () => {
    const answered = await answerIncomingRequest('terminal/create', {})
    expect(answered.isErr()).toBe(true)
    if (answered.isErr()) {
      expect(answered.error.code).toBe(-32601)
    }
  })
})
