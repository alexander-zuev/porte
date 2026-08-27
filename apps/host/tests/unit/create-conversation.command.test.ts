import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createConversation } from '@host/application/commands/create-conversation.command.ts'
import { WorkspaceNotAllowedError } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('createConversation', () => {
  it('rejects a directory that is not a git workspace', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'porte-nogit-'))
    await expect(
      createConversation(
        {
          createSession: () => Promise.reject(new TypeError('unexpected create')),
          hold: () => {
            throw new TypeError('unexpected hold')
          },
        },
        { cwd },
      ),
    ).rejects.toBeInstanceOf(WorkspaceNotAllowedError)
  })
})
