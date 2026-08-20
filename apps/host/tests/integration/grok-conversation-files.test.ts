import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  findGrokConversation,
  listGrokConversations,
} from '@host/adapters/grok/grok-conversation-files.ts'
import type { GrokSummaryFile } from '@host/adapters/grok/grok-summary.ts'
import { describe, expect, it } from 'vitest'

describe('Grok conversation files', () => {
  it('returns an empty array when sessions is missing', async () => {
    const grokHome = await mkdtemp(join(tmpdir(), 'porte-list-'))
    const listed = await listGrokConversations(grokHome)
    expect(listed.isOk() && listed.value).toEqual([])
  })

  it('returns a typed error when the store cannot be read', async () => {
    const grokHome = await mkdtemp(join(tmpdir(), 'porte-list-'))
    await writeFile(join(grokHome, 'sessions'), 'not a directory')

    const listed = await listGrokConversations(grokHome)

    expect(listed.isErr() && listed.error._tag).toBe('GrokConversationFilesError')
  })

  it('maps title, cwd fallback, sort, and skips subagents', async () => {
    const grokHome = await mkdtemp(join(tmpdir(), 'porte-list-'))
    const encoded = encodeURIComponent('/tmp/proj')
    const other = encodeURIComponent('/tmp/other')

    await writeSummary(grokHome, encoded, 'sess-a', {
      info: { id: 'id-a', cwd: '/tmp/proj' },
      generated_title: 'Alpha',
      last_active_at: '2026-08-17T10:00:00.000Z',
    })
    await writeSummary(grokHome, encoded, 'sess-sub', {
      info: { id: 'id-sub', cwd: '/tmp/proj' },
      generated_title: 'Sub',
      updated_at: '2026-08-17T11:00:00.000Z',
      session_kind: 'subagent',
    })
    await writeSummary(grokHome, encoded, 'sess-c', {
      info: { id: 'id-c' },
      session_summary: 'From summary',
      updated_at: '2026-08-17T09:00:00.000Z',
    })
    await mkdir(join(grokHome, 'sessions', encoded, 'sess-empty'), { recursive: true })
    await writeSummary(grokHome, other, 'sess-e', {
      info: { id: 'id-e', cwd: '/tmp/other' },
      generated_title: '',
      session_summary: 'Other',
      updated_at: '2026-08-17T08:00:00.000Z',
    })

    const listed = await listGrokConversations(grokHome)
    expect(listed.isOk() && listed.value.map((row) => row.summary)).toEqual([
      { id: 'id-a', cwd: '/tmp/proj', title: 'Alpha', updatedAt: '2026-08-17T10:00:00.000Z' },
      {
        id: 'id-c',
        cwd: '/tmp/proj',
        title: 'From summary',
        updatedAt: '2026-08-17T09:00:00.000Z',
      },
      { id: 'id-e', cwd: '/tmp/other', title: 'Other', updatedAt: '2026-08-17T08:00:00.000Z' },
    ])
  })

  it('reports missing and duplicate ids', async () => {
    const grokHome = await mkdtemp(join(tmpdir(), 'porte-list-'))
    const encoded = encodeURIComponent('/tmp/proj')
    await writeSummary(grokHome, encoded, 'one', {
      info: { id: 'dup', cwd: '/tmp/proj' },
      updated_at: '2026-08-17T10:00:00.000Z',
    })
    await writeSummary(grokHome, encodeURIComponent('/tmp/other'), 'two', {
      info: { id: 'dup', cwd: '/tmp/other' },
      updated_at: '2026-08-17T09:00:00.000Z',
    })

    const missing = await findGrokConversation(grokHome, 'missing')
    expect(missing.isErr() && missing.error._tag).toBe('GrokConversationNotFoundError')
    const found = await findGrokConversation(grokHome, 'dup')
    expect(found.isErr()).toBe(true)
    if (found.isErr() && found.error._tag === 'DuplicateGrokConversationError') {
      expect(found.error.folderPaths).toHaveLength(2)
    }
  })
})

async function writeSummary(
  grokHome: string,
  group: string,
  sessionDir: string,
  body: GrokSummaryFile,
): Promise<void> {
  const folder = join(grokHome, 'sessions', group, sessionDir)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'summary.json'), JSON.stringify(body))
}
