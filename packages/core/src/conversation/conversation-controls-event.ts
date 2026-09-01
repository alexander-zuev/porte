import { z } from 'zod'

const selectConfigurationValueSchema = z.object({
  type: z.literal('option'),
  value: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  /** The provider's default for this select; a picker may badge it. */
  default: z.boolean().optional(),
})

const selectConfigurationGroupSchema = z.object({
  type: z.literal('group'),
  group: z.string().min(1),
  name: z.string().min(1),
  options: z.array(selectConfigurationValueSchema).min(1),
})

const selectableValues = (
  options: readonly z.infer<
    typeof selectConfigurationValueSchema | typeof selectConfigurationGroupSchema
  >[],
) => options.flatMap((option) => (option.type === 'group' ? option.options : [option]))

const selectConfigurationSchema = z
  .object({
    type: z.literal('select'),
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    currentValue: z.string().min(1),
    options: z
      .array(z.union([selectConfigurationValueSchema, selectConfigurationGroupSchema]))
      .min(1),
  })
  .refine(
    (configuration) =>
      selectableValues(configuration.options).some(
        (option) => option.value === configuration.currentValue,
      ),
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

/** One provider-independent configuration option for a conversation. */
export const ConversationConfigurationOptionSchema = z.discriminatedUnion('type', [
  selectConfigurationSchema,
  booleanConfigurationSchema,
])

/** One provider-independent configuration option for a conversation. */
export type ConversationConfigurationOption = z.infer<typeof ConversationConfigurationOptionSchema>

/** One slash command advertised by the coding agent. */
export const ConversationCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputHint: z.string().optional(),
})

/** One slash command advertised by the coding agent. */
export type ConversationCommand = z.infer<typeof ConversationCommandSchema>

const controlsEventDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('conversation.configuration.updated'),
    options: z.array(ConversationConfigurationOptionSchema),
  }),
  z.object({
    type: z.literal('conversation.commands.updated'),
    commands: z.array(ConversationCommandSchema),
  }),
  z.object({ type: z.literal('conversation.mode.updated'), modeId: z.string().min(1) }),
])

/** Canonical configuration or command replacement for one conversation. */
export const ConversationControlsEventSchema = controlsEventDataSchema

/** Canonical configuration or command replacement for one conversation. */
export type ConversationControlsEvent = z.infer<typeof ConversationControlsEventSchema>
