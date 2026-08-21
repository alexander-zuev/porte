import {
  PendingElicitationSchema,
  PendingPermissionSchema,
  makeConversationSummary,
  type ConversationSummary,
} from '@porte/core'

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
