import { z } from 'zod'

import { PermissionIdSchema, ToolCallIdSchema, TurnIdSchema } from '../identity/identity.ts'

/** One user decision offered for a coding-agent permission request. */
export const PermissionOptionSchema = z.object({
  optionId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['allow_once', 'allow_always', 'reject_once', 'reject_always']),
})

/** One user decision offered for a coding-agent permission request. */
export type PermissionOption = z.infer<typeof PermissionOptionSchema>

const permissionOptionsSchema = z
  .array(PermissionOptionSchema)
  .min(1)
  .refine((options) => new Set(options.map((option) => option.optionId)).size === options.length, {
    error: 'Permission option identifiers must be unique',
  })

/** One permission request waiting for a user decision. */
export const PendingPermissionSchema = z.object({
  turnId: TurnIdSchema,
  permissionId: PermissionIdSchema,
  toolCallId: ToolCallIdSchema,
  title: z.string(),
  options: permissionOptionsSchema,
})

/** One permission request waiting for a user decision. */
export type PendingPermission = z.infer<typeof PendingPermissionSchema>

const permissionEventDataSchema = z.discriminatedUnion('type', [
  PendingPermissionSchema.extend({ type: z.literal('permission.requested') }),
  z.object({
    type: z.literal('permission.resolved'),
    turnId: TurnIdSchema,
    permissionId: PermissionIdSchema,
    outcome: z.discriminatedUnion('type', [
      z.object({ type: z.literal('selected'), optionId: z.string().min(1) }),
      z.object({ type: z.literal('cancelled') }),
      // Another client of the shared Grok session answered first; the card goes, no decision here.
      z.object({ type: z.literal('answered-elsewhere') }),
    ]),
  }),
])

/** Canonical permission interaction event for one conversation. */
export const ConversationPermissionEventSchema = permissionEventDataSchema

/** Canonical permission interaction event for one conversation. */
export type ConversationPermissionEvent = z.infer<typeof ConversationPermissionEventSchema>
