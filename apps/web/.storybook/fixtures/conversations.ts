import {
  PendingElicitationSchema,
  PendingPermissionSchema,
  makeConversationSummary,
  type ConversationSummary,
} from '@porte/core'
import type { TranscriptItem } from '@web/entities/conversation/transcript.ts'

// Named, so a story can point at one row without indexing into the array.
export const listResume = makeConversationSummary({
  id: 'con_porte_1',
  cwd: '/Users/az/projects/porte',
  title: 'Daemon list and resume',
  updatedAt: '2026-08-17T10:12:00.000Z',
})

export const hostContract = makeConversationSummary({
  id: 'con_porte_2',
  cwd: '/Users/az/projects/porte',
  title: 'Worker host contract',
  updatedAt: '2026-08-16T18:40:00.000Z',
})

export const storybookSetup = makeConversationSummary({
  id: 'con_typist_1',
  cwd: '/Users/az/projects/typist',
  title: 'Storybook TanStack Start',
  updatedAt: '2026-08-15T09:00:00.000Z',
})

export const conversations: readonly ConversationSummary[] = [
  listResume,
  hostContract,
  storybookSetup,
]

/** The signed-in account every page story renders in its footer or header. */
export const storyUser = {
  name: 'Alexander Zuev',
  email: 'azuevpersonal@gmail.com',
} as const

export const streamingItems: readonly TranscriptItem[] = [
  {
    kind: 'user',
    id: 'evt_1',
    text: 'Resume yesterday and add a health check.',
  },
  {
    kind: 'thought',
    id: 'evt_2',
    text: 'Load the conversation, then inspect the daemon entry.',
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
    text: 'List conversations in this repo.',
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
      'Send `conversation/cancel`, then kill the process group if Grok keeps working.',
      '',
      '1. User taps Stop',
      '2. Client sends `turn.cancel`',
      '3. Daemon forwards `conversation/cancel`',
      '',
      '```ts',
      'await client.cancel(conversationId)',
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
    text: 'Empty conversation dirs have no summary.json. Skip them so the list only shows resumable rows.',
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
    text: 'Resume /Users/az/projects/porte/apps/daemon/src/conversations/conversation-store.ts and explain why encoded cwd folders must stay opaque on the Worker.',
  },
  {
    kind: 'agent',
    id: 'evt_long_2',
    text: 'The Worker never decodes host paths. cwd is an opaque string from the list. Only the daemon checks that the path is absolute and allowed.',
  },
]

/** Permission request used by conversation decision stories. */
export const pendingPermission = PendingPermissionSchema.parse({
  turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
  permissionId: '0198b55e-49d7-7b67-922a-2ee176ca2c4c',
  toolCallId: 'tool-1',
  title: 'Run a shell command',
  options: [
    { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow_always', name: 'Always allow', kind: 'allow_always' },
    { optionId: 'reject_once', name: 'Deny once', kind: 'reject_once' },
  ],
})

/** Form request used by elicitation stories. */
export const formElicitation = PendingElicitationSchema.parse({
  turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
  elicitationId: '0198b55e-49d8-7e0f-9917-b08777b451b9',
  request: {
    type: 'form',
    fields: [
      {
        type: 'text',
        id: 'environment',
        label: 'Target environment',
        required: true,
        options: ['Preview', 'Production'],
      },
      { type: 'number', id: 'retries', label: 'Maximum retries', required: true },
      { type: 'boolean', id: 'include_logs', label: 'Include diagnostic logs', required: false },
    ],
  },
})

/** External URL request used by elicitation stories. */
export const urlElicitation = PendingElicitationSchema.parse({
  turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
  elicitationId: '0198b55e-49d9-7e0f-9917-b08777b451b9',
  request: { type: 'url', url: 'https://console.example.com/authorize/porte' },
})
