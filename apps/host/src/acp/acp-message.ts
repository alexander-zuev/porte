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

/** One streamed ACP `session/update` payload. */
export type AcpSessionUpdate = {
  readonly sessionUpdate: string
  readonly [key: string]: JsonValue
}

const jsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: jsonValueSchema.optional(),
})

const sessionUpdateSchema = z
  .object({
    sessionUpdate: z.string(),
  })
  .catchall(jsonValueSchema)

const sessionUpdateNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('session/update'),
  params: z.object({
    update: sessionUpdateSchema,
  }),
})

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
  | { readonly kind: 'update'; readonly update: AcpSessionUpdate }
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
    return { kind: 'update', update: update.data.params.update }
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
