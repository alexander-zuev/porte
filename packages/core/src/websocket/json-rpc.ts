import { z } from 'zod'

/**
 * JSON-RPC 2.0, the envelope for every message on a socket.
 *
 * A WebSocket frame has no reply, no correlation, and no failure channel: RFC
 * 6455 offers close codes and nothing else. This supplies the three, and it is
 * a published specification rather than one more hand-rolled shape.
 *
 * Nothing here knows an application. A domain enters at two points only: the
 * `method` string, and the `data` a failure carries.
 *
 * @see https://www.jsonrpc.org/specification
 */
export const JSON_RPC_VERSION = '2.0'

/** Correlates one response to one request. Absent on a notification. */
export const JsonRpcIdSchema = z.union([z.string().min(1), z.number().int()])
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>

/**
 * The codes the specification reserves, and the one range it leaves open.
 *
 * `serverError` is where an application failure goes. Its meaning belongs in
 * the error's `data`, because a number cannot carry one and outlives every
 * attempt to make it.
 */
export const JSON_RPC_ERROR_CODES = {
  parseError: -32_700,
  invalidRequest: -32_600,
  methodNotFound: -32_601,
  invalidParams: -32_602,
  internalError: -32_603,
  serverError: -32_000,
} as const

export type JsonRpcErrorCode = (typeof JSON_RPC_ERROR_CODES)[keyof typeof JSON_RPC_ERROR_CODES]

/** One failure, and whatever its `data` says about it. */
export type JsonRpcErrorObject<Data> = {
  readonly code: number
  readonly message: string
  readonly data: Data
}

/** One call that expects exactly one response. */
export type JsonRpcRequest<Method extends string, Params> = {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly id: JsonRpcId
  readonly method: Method
  readonly params: Params
}

/** One call that expects no response. Events and acknowledgements are these. */
export type JsonRpcNotification<Method extends string, Params> = {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly method: Method
  readonly params: Params
}

/** The response to one call. `'error' in response` is the whole test. */
export type JsonRpcResponse<Result, ErrorData> =
  | {
      readonly jsonrpc: typeof JSON_RPC_VERSION
      readonly id: JsonRpcId
      readonly result: Result
    }
  | {
      readonly jsonrpc: typeof JSON_RPC_VERSION
      readonly id: JsonRpcId
      readonly error: JsonRpcErrorObject<ErrorData>
    }

const versionSchema = z.literal(JSON_RPC_VERSION)

/** The schema for one call, over the params its method accepts. */
export function jsonRpcRequestSchema<Method extends string, Params extends z.ZodType>(
  method: Method,
  params: Params,
) {
  return z.object({
    jsonrpc: versionSchema,
    id: JsonRpcIdSchema,
    method: z.literal(method),
    params,
  })
}

/** The schema for one notification, over the params its method accepts. */
export function jsonRpcNotificationSchema<Method extends string, Params extends z.ZodType>(
  method: Method,
  params: Params,
) {
  return z.object({
    jsonrpc: versionSchema,
    method: z.literal(method),
    params,
  })
}

/** The schema for one failure, over whatever its `data` carries. */
export function jsonRpcErrorObjectSchema<Data extends z.ZodType>(data: Data) {
  return z.object({
    code: z.number().int(),
    message: z.string(),
    data,
  })
}

/**
 * The schema for one response, over the result and the failure it may carry.
 *
 * A union rather than a discriminated one: the specification separates the two
 * arms by which key is present, and neither is a literal to discriminate on.
 */
export function jsonRpcResponseSchema<Result extends z.ZodType, ErrorData extends z.ZodType>(
  result: Result,
  errorData: ErrorData,
) {
  return z.union([
    z.object({ jsonrpc: versionSchema, id: JsonRpcIdSchema, result }),
    z.object({
      jsonrpc: versionSchema,
      id: JsonRpcIdSchema,
      error: jsonRpcErrorObjectSchema(errorData),
    }),
  ])
}

/** One call, addressed to the method it names. */
export function jsonRpcRequest<Method extends string, Params>(
  id: JsonRpcId,
  method: Method,
  params: Params,
): JsonRpcRequest<Method, Params> {
  return { jsonrpc: JSON_RPC_VERSION, id, method, params }
}

/** One notification. Nothing answers it, so it carries no identifier. */
export function jsonRpcNotification<Method extends string, Params>(
  method: Method,
  params: Params,
): JsonRpcNotification<Method, Params> {
  return { jsonrpc: JSON_RPC_VERSION, method, params }
}

/** The answer to one call that worked. */
export function jsonRpcResult<Result>(
  id: JsonRpcId,
  result: Result,
): JsonRpcResponse<Result, never> {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

/** The answer to one call that did not. Defaults to the open code range. */
export function jsonRpcError<ErrorData>(
  id: JsonRpcId,
  message: string,
  data: ErrorData,
  code: number = JSON_RPC_ERROR_CODES.serverError,
): JsonRpcResponse<never, ErrorData> {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code, message, data } }
}

/** Whether one response carries a failure. */
export function isJsonRpcError<Result, ErrorData>(
  response: JsonRpcResponse<Result, ErrorData>,
): response is Extract<JsonRpcResponse<Result, ErrorData>, { error: unknown }> {
  return 'error' in response
}
