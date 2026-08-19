import { z } from 'zod'

import { ElicitationIdSchema, EventIdSchema, SessionIdSchema, TurnIdSchema } from './identity.ts'

const textFieldOptionsSchema = z
  .array(z.string())
  .min(1)
  .refine((options) => new Set(options).size === options.length, {
    error: 'Text field options must be unique',
  })

/** Scalar value accepted by a supported elicitation form. */
export const FormValueSchema = z.union([z.string(), z.number(), z.boolean()])

/** Scalar value accepted by a supported elicitation form. */
export type FormValue = z.infer<typeof FormValueSchema>

/** One supported field in a coding-agent elicitation form. */
export const FormFieldSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    id: z.string().min(1),
    label: z.string(),
    required: z.boolean(),
    options: textFieldOptionsSchema.optional(),
  }),
  z.object({
    type: z.literal('number'),
    id: z.string().min(1),
    label: z.string(),
    required: z.boolean(),
  }),
  z.object({
    type: z.literal('boolean'),
    id: z.string().min(1),
    label: z.string(),
    required: z.boolean(),
  }),
])

/** One supported field in a coding-agent elicitation form. */
export type FormField = z.infer<typeof FormFieldSchema>

const formFieldsSchema = z
  .array(FormFieldSchema)
  .min(1)
  .refine((fields) => new Set(fields.map((field) => field.id)).size === fields.length, {
    error: 'Form field identifiers must be unique',
  })

/** One elicitation request waiting for a user decision. */
export const PendingElicitationSchema = z.object({
  turnId: TurnIdSchema,
  elicitationId: ElicitationIdSchema,
  request: z.discriminatedUnion('type', [
    z.object({ type: z.literal('form'), fields: formFieldsSchema }),
    z.object({ type: z.literal('url'), url: z.httpUrl() }),
  ]),
})

/** One elicitation request waiting for a user decision. */
export type PendingElicitation = z.infer<typeof PendingElicitationSchema>

/** User answer accepted by the elicitation application handler. */
export const ElicitationAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit'), values: z.record(z.string(), FormValueSchema) }),
  z.object({ type: z.literal('accept') }),
  z.object({ type: z.literal('decline') }),
  z.object({ type: z.literal('cancel') }),
])

/** User answer accepted by the elicitation application handler. */
export type ElicitationAnswer = z.infer<typeof ElicitationAnswerSchema>

const elicitationEventDataSchema = z.discriminatedUnion('type', [
  PendingElicitationSchema.extend({ type: z.literal('elicitation.requested') }),
  z.object({
    type: z.literal('elicitation.resolved'),
    turnId: TurnIdSchema,
    elicitationId: ElicitationIdSchema,
    outcome: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('submitted'),
        values: z.record(z.string(), FormValueSchema),
      }),
      z.object({ type: z.literal('accepted') }),
      z.object({ type: z.literal('declined') }),
      z.object({ type: z.literal('cancelled') }),
    ]),
  }),
  z.object({
    type: z.literal('elicitation.completed'),
    turnId: TurnIdSchema,
    elicitationId: ElicitationIdSchema,
  }),
])

/** Canonical elicitation interaction event for one coding session. */
export const CodingSessionElicitationEventSchema = z.intersection(
  z.object({ eventId: EventIdSchema, sessionId: SessionIdSchema }),
  elicitationEventDataSchema,
)

/** Canonical elicitation interaction event for one coding session. */
export type CodingSessionElicitationEvent = z.infer<typeof CodingSessionElicitationEventSchema>
