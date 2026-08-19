/** Validates ACP messages at the coding-agent boundary. */
import { z } from 'zod'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

/** JSON value that passed ACP parsing. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** JSON-RPC error object from an ACP agent. */
export type JsonRpcError = {
  readonly code: number
  readonly message: string
  readonly data?: JsonValue
}

const jsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: jsonValueSchema.optional(),
})

const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string().min(1) }),
  z.object({ type: z.literal('audio'), data: z.string(), mimeType: z.string().min(1) }),
  z.object({
    type: z.literal('resource_link'),
    uri: z.string().min(1),
    name: z.string().min(1),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    size: z.number().int().nullable().optional(),
  }),
  z.object({
    type: z.literal('resource'),
    resource: z.union([
      z.object({
        uri: z.string().min(1),
        mimeType: z.string().nullable().optional(),
        text: z.string(),
      }),
      z.object({
        uri: z.string().min(1),
        mimeType: z.string().nullable().optional(),
        blob: z.string(),
      }),
    ]),
  }),
])

const toolKindSchema = z.enum([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
])
const toolStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed'])
const toolContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content'), content: contentBlockSchema }),
  z.object({
    type: z.literal('diff'),
    path: z.string().min(1),
    oldText: z.string().nullable().optional(),
    newText: z.string(),
  }),
  z.object({ type: z.literal('terminal'), terminalId: z.string().min(1) }),
])
const toolLocationSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().nonnegative().nullable().optional(),
})

const contentChunkSchema = z.object({
  content: contentBlockSchema,
  messageId: z.string().min(1).nullable().optional(),
})
const toolCallSchema = z.object({
  toolCallId: z.string().min(1),
  title: z.string(),
  kind: toolKindSchema.optional(),
  status: toolStatusSchema.optional(),
  content: z.array(toolContentSchema).optional(),
  locations: z.array(toolLocationSchema).optional(),
})
const toolCallUpdateSchema = z.object({
  toolCallId: z.string().min(1),
  title: z.string().nullable().optional(),
  kind: toolKindSchema.nullable().optional(),
  status: toolStatusSchema.nullable().optional(),
  content: z.array(toolContentSchema).nullable().optional(),
  locations: z.array(toolLocationSchema).nullable().optional(),
})
const planEntrySchema = z.object({
  content: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  status: z.enum(['pending', 'in_progress', 'completed']),
})
const commandSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input: z.object({ hint: z.string() }).nullable().optional(),
})
const configurationBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
})
const configurationSchema = z.discriminatedUnion('type', [
  configurationBaseSchema.extend({
    type: z.literal('select'),
    currentValue: z.string().min(1),
    options: z.array(
      z.object({
        value: z.string().min(1),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
      }),
    ),
  }),
  configurationBaseSchema.extend({ type: z.literal('boolean'), currentValue: z.boolean() }),
])

const sessionUpdateSchema = z.discriminatedUnion('sessionUpdate', [
  contentChunkSchema.extend({ sessionUpdate: z.literal('user_message_chunk') }),
  contentChunkSchema.extend({ sessionUpdate: z.literal('agent_message_chunk') }),
  contentChunkSchema.extend({ sessionUpdate: z.literal('agent_thought_chunk') }),
  toolCallSchema.extend({ sessionUpdate: z.literal('tool_call') }),
  toolCallUpdateSchema.extend({ sessionUpdate: z.literal('tool_call_update') }),
  z.object({ sessionUpdate: z.literal('plan'), entries: z.array(planEntrySchema) }),
  z.object({
    sessionUpdate: z.literal('available_commands_update'),
    availableCommands: z.array(commandSchema),
  }),
  z.object({ sessionUpdate: z.literal('current_mode_update'), currentModeId: z.string().min(1) }),
  z.object({
    sessionUpdate: z.literal('config_option_update'),
    configOptions: z.array(configurationSchema),
  }),
  z.object({
    sessionUpdate: z.literal('session_info_update'),
    title: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  }),
  z.object({
    sessionUpdate: z.literal('usage_update'),
    used: z.number().int().nonnegative(),
    size: z.number().int().nonnegative(),
    cost: z
      .object({ amount: z.number().nonnegative(), currency: z.string().min(1) })
      .nullable()
      .optional(),
  }),
])

const sessionUpdateNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('session/update'),
  params: z.object({
    sessionId: z.string().min(1),
    update: sessionUpdateSchema,
  }),
})

/** One validated ACP `session/update` payload. */
export type AcpSessionUpdate = z.infer<typeof sessionUpdateSchema>

/** One validated ACP `session/update` notification. */
export type AcpSessionNotification = z.infer<typeof sessionUpdateNotificationSchema>['params']

const jsonRpcIncomingSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number(),
  method: z.string().min(1),
  params: jsonValueSchema.optional(),
})

const jsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.number(),
    result: jsonValueSchema.optional(),
    error: jsonRpcErrorSchema.optional(),
  })
  .refine((value) => !('method' in value))

/** A parsed stdout line from an ACP agent. */
export type AcpLine =
  | { readonly kind: 'update'; readonly notification: AcpSessionNotification }
  | {
      readonly kind: 'incoming'
      readonly id: number
      readonly method: string
      readonly params: JsonValue | undefined
    }
  | {
      readonly kind: 'response'
      readonly id: number
      readonly result: JsonValue | undefined
      readonly error: JsonRpcError | undefined
    }

/** Parse one ACP stdout line and skip non-protocol output. */
export function parseAcpLine(line: string): AcpLine | undefined {
  if (line.length === 0) {
    return undefined
  }
  let json: JsonValue
  try {
    json = jsonValueSchema.parse(JSON.parse(line))
  } catch {
    return undefined
  }

  const update = sessionUpdateNotificationSchema.safeParse(json)
  if (update.success) {
    return { kind: 'update', notification: update.data.params }
  }
  const incoming = jsonRpcIncomingSchema.safeParse(json)
  if (incoming.success) {
    return {
      kind: 'incoming',
      id: incoming.data.id,
      method: incoming.data.method,
      params: incoming.data.params,
    }
  }
  const response = jsonRpcResponseSchema.safeParse(json)
  if (response.success) {
    return {
      kind: 'response',
      id: response.data.id,
      result: response.data.result,
      error: response.data.error,
    }
  }
  return undefined
}

/** One JSON-RPC request sent to an ACP agent. */
export type AcpRequest = {
  readonly method: string
  readonly params: JsonValue | undefined
}
