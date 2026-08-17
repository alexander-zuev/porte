import { makeSessionSummary, type SessionSummary } from '@lras/core'

import type { PermissionRequest, TranscriptItem } from '#/features/session/models/transcript.ts'

export const sessions: readonly SessionSummary[] = [
  makeSessionSummary({
    id: 'ses_lras_1',
    cwd: '/Users/az/projects/lras',
    title: 'Daemon list and resume',
    updatedAt: '2026-08-17T10:12:00.000Z',
  }),
  makeSessionSummary({
    id: 'ses_lras_2',
    cwd: '/Users/az/projects/lras',
    title: 'Worker host contract',
    updatedAt: '2026-08-16T18:40:00.000Z',
  }),
  makeSessionSummary({
    id: 'ses_typist_1',
    cwd: '/Users/az/projects/typist',
    title: 'Storybook TanStack Start',
    updatedAt: '2026-08-15T09:00:00.000Z',
  }),
]

export const streamingItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_1',
    text: 'Resume yesterday and add a health check.',
  },
  {
    kind: 'thought',
    id: 'evt_2',
    text: 'Load the session, then inspect the daemon entry.',
  },
  {
    kind: 'tool',
    id: 'evt_3',
    name: 'read_file',
    status: 'done',
    summary: 'apps/daemon/src/main.ts',
  },
  {
    kind: 'tool',
    id: 'evt_4',
    name: 'edit',
    status: 'running',
    summary: 'apps/daemon/src/cli.ts',
  },
  {
    kind: 'agent',
    id: 'evt_5',
    text: 'Adding a `/health` command on the CLI next to `list`.',
  },
]

export const userOnlyItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_user_1',
    text: 'List sessions in this repo.',
  },
]

export const markdownItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_md_1',
    text: 'How do I cancel a turn?',
  },
  {
    kind: 'agent',
    id: 'evt_md_2',
    text: [
      'Send `session/cancel`, then kill the process group if Grok keeps working.',
      '',
      '1. User taps Stop',
      '2. Client sends `turn.cancel`',
      '3. Daemon forwards `session/cancel`',
      '',
      '```ts',
      'await client.cancel(sessionId)',
      '```',
    ].join('\n'),
  },
]

export const reasoningItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_think_1',
    text: 'Why did list skip empty folders?',
  },
  {
    kind: 'thought',
    id: 'evt_think_2',
    text: 'Empty session dirs have no summary.json. Skip them so the catalog only shows resumable rows.',
  },
  {
    kind: 'agent',
    id: 'evt_think_3',
    text: 'Those folders are leftovers. List only rows with a summary.',
  },
]

export const toolsItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_tool_1',
    text: 'Add a health command.',
  },
  {
    kind: 'tool',
    id: 'evt_tool_2',
    name: 'read_file',
    status: 'done',
    summary: 'apps/daemon/src/main.ts',
  },
  {
    kind: 'tool',
    id: 'evt_tool_3',
    name: 'edit',
    status: 'running',
    summary: 'apps/daemon/src/cli.ts',
  },
]

export const longMessageItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_long_1',
    text: 'Resume /Users/az/projects/lras/apps/daemon/src/sessions/session-store.ts and explain why encoded cwd folders must stay opaque on the Worker.',
  },
  {
    kind: 'agent',
    id: 'evt_long_2',
    text: 'The Worker never decodes host paths. cwd is an opaque string from the catalog. Only the daemon checks that the path is absolute and allowed.',
  },
]

export const permissionRequest: PermissionRequest = {
  id: 'perm_1',
  title: 'Run a shell command',
  detail: 'Grok wants to run `pnpm test` in /Users/az/projects/lras.',
  options: [
    { id: 'allow_once', label: 'Allow once' },
    { id: 'allow_always', label: 'Always allow' },
    { id: 'reject_once', label: 'Deny' },
  ],
}
