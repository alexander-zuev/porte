import {
  ConversationIdSchema,
  IsoDateTimeSchema,
  makeConversationSummary,
  type ConversationSummary,
} from '@porte/core/client'

// Named, so a story can point at one row without indexing into the array.
export const listResume = makeConversationSummary({
  id: ConversationIdSchema.parse('con_porte_1'),
  cwd: '/Users/az/projects/porte',
  gitRoot: '/Users/az/projects/porte',
  title: 'Daemon list and resume',
  updatedAt: IsoDateTimeSchema.parse('2026-08-17T10:12:00.000Z'),
})

export const hostContract = makeConversationSummary({
  id: ConversationIdSchema.parse('con_porte_2'),
  cwd: '/Users/az/projects/porte/apps/web',
  gitRoot: '/Users/az/projects/porte',
  title: 'Worker host contract',
  updatedAt: IsoDateTimeSchema.parse('2026-08-16T18:40:00.000Z'),
})

export const storybookSetup = makeConversationSummary({
  id: ConversationIdSchema.parse('con_typist_1'),
  cwd: '/Users/az/projects/typist',
  gitRoot: '/Users/az/projects/typist',
  title: 'Storybook TanStack Start',
  updatedAt: IsoDateTimeSchema.parse('2026-08-15T09:00:00.000Z'),
})

/** Created by the machine, not yet titled by the agent: rows must render its placeholder. */
export const unnamed = makeConversationSummary({
  id: ConversationIdSchema.parse('con_porte_3'),
  cwd: '/Users/az/projects/porte',
  gitRoot: '/Users/az/projects/porte',
  title: '',
  // Mid-day UTC so the date part stays the same calendar day in every test time zone.
  updatedAt: IsoDateTimeSchema.parse('2026-08-18T09:00:00.000Z'),
})

// `unnamed` sits second: stories point their running/unseen markers at the first row.
export const conversations: readonly ConversationSummary[] = [
  listResume,
  unnamed,
  hostContract,
  storybookSetup,
]

/** The signed-in account every page story renders in its footer or header. */
export const storyUser = {
  name: 'Alexander Zuev',
  email: 'azuevpersonal@gmail.com',
} as const
