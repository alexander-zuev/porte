import { z } from 'zod'

import { EventIdSchema, SessionIdSchema } from './identity.ts'

const selectConfigurationValueSchema = z.object({
  value: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
})

const selectConfigurationSchema = z
  .object({
    type: z.literal('select'),
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    currentValue: z.string().min(1),
    options: z.array(selectConfigurationValueSchema).min(1),
  })
  .refine(
    (configuration) =>
      configuration.options.some((option) => option.value === configuration.currentValue),
    { error: 'Current value must match one select option' },
  )

const booleanConfigurationSchema = z.object({
  type: z.literal('boolean'),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  currentValue: z.boolean(),
})

/** One provider-independent configuration option for a coding session. */
export const SessionConfigurationOptionSchema = z.discriminatedUnion('type', [
  selectConfigurationSchema,
  booleanConfigurationSchema,
])

/** One provider-independent configuration option for a coding session. */
export type SessionConfigurationOption = z.infer<typeof SessionConfigurationOptionSchema>

/** One slash command advertised by the coding agent. */
export const SessionCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputHint: z.string().optional(),
})

/** One slash command advertised by the coding agent. */
export type SessionCommand = z.infer<typeof SessionCommandSchema>

const controlsEventDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.configuration.updated'),
    options: z.array(SessionConfigurationOptionSchema),
  }),
  z.object({
    type: z.literal('session.commands.updated'),
    commands: z.array(SessionCommandSchema),
  }),
])

/** Canonical configuration or command replacement for one coding session. */
export const CodingSessionControlsEventSchema = z.intersection(
  z.object({ eventId: EventIdSchema, sessionId: SessionIdSchema }),
  controlsEventDataSchema,
)

/** Canonical configuration or command replacement for one coding session. */
export type CodingSessionControlsEvent = z.infer<typeof CodingSessionControlsEventSchema>
