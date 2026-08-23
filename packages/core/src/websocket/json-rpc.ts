import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

/**
 * JSON-RPC 2.0 envelopes without socket or application behavior.
 * @see https://www.jsonrpc.org/specification
 */
export const JSON_RPC_VERSION = '2.0'

export const JSON_RPC_ERROR_CODES = {
  parseError: -32_700,
  invalidRequest: -32_600,
  methodNotFound: -32_601,
  invalidParams: -32_602,
  internalError: -32_603,
} as const

export type JsonRpcErrorCode = (typeof JSON_RPC_ERROR_CODES)[keyof typeof JSON_RPC_ERROR_CODES]

/** The two method kinds defined by JSON-RPC 2.0. */
export const JSON_RPC_METHOD_KINDS = {
  request: 'request',
  notification: 'notification',
} as const

/** Whether a JSON-RPC method receives a response. */
export type JsonRpcMethodKind = (typeof JSON_RPC_METHOD_KINDS)[keyof typeof JSON_RPC_METHOD_KINDS]

/** One method contract in a typed JSON-RPC registry. */
export type JsonRpcMethodDefinition =
  | {
      readonly kind: typeof JSON_RPC_METHOD_KINDS.request
      readonly params: z.ZodType
      readonly result: z.ZodType
    }
  | {
      readonly kind: typeof JSON_RPC_METHOD_KINDS.notification
      readonly params: z.ZodType
    }

const JsonRpcVersionSchema = z.literal(JSON_RPC_VERSION)
const JsonRpcParamsSchema = z.union([z.record(z.string(), z.json()), z.array(z.json())])

/** A request identifier can be a string, number, or null under JSON-RPC 2.0. */
export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()])
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>

export const JsonRpcRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.string(),
  params: JsonRpcParamsSchema.optional(),
  result: z.never().optional(),
  error: z.never().optional(),
})

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.never().optional(),
  method: z.string(),
  params: JsonRpcParamsSchema.optional(),
  result: z.never().optional(),
  error: z.never().optional(),
})

export const JsonRpcErrorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.json().optional(),
})

export const JsonRpcSuccessResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.never().optional(),
  result: z.json(),
  error: z.never().optional(),
})

export const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.never().optional(),
  result: z.never().optional(),
  error: JsonRpcErrorObjectSchema,
})

export const JsonRpcResponseSchema = z.union([
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
])

export const JsonRpcDocumentSchema = z.union([
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
])

export type JsonRpcDocument = z.infer<typeof JsonRpcDocumentSchema>

export type JsonRpcErrorObject<Data> = {
  readonly code: number
  readonly message: string
  readonly data?: Data
}

export type JsonRpcRequest<Method extends string, Params> = {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly id: JsonRpcId
  readonly method: Method
  readonly params: Params
}

export type JsonRpcNotification<Method extends string, Params> = {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly method: Method
  readonly params: Params
}

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

/** A standard protocol error found while decoding one JSON-RPC document. */
export type JsonRpcDecodeError =
  | { readonly code: -32_700; readonly message: 'Parse error' }
  | { readonly code: -32_600; readonly message: 'Invalid Request' }

/** The parsed JSON-RPC document or its standard protocol error. */
export type JsonRpcDecodeResult = ResultType<JsonRpcDocument, JsonRpcDecodeError>

/** Decode one JSON-RPC document without owning the transport response. */
export function decodeJsonRpc(text: string): JsonRpcDecodeResult {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return Result.err({ code: JSON_RPC_ERROR_CODES.parseError, message: 'Parse error' })
  }

  const parsed = JsonRpcDocumentSchema.safeParse(value)
  if (parsed.success) return Result.ok(parsed.data)

  return Result.err({ code: JSON_RPC_ERROR_CODES.invalidRequest, message: 'Invalid Request' })
}

/** Create a schema for one method-specific request. */
export function jsonRpcRequestSchema<
  Method extends string,
  Params extends z.ZodType,
  Id extends z.ZodType,
>(method: Method, params: Params, id: Id) {
  return z.object({
    jsonrpc: JsonRpcVersionSchema,
    id,
    method: z.literal(method),
    params,
    result: z.never().optional(),
    error: z.never().optional(),
  })
}

/** Create a schema for one method-specific notification. */
export function jsonRpcNotificationSchema<Method extends string, Params extends z.ZodType>(
  method: Method,
  params: Params,
) {
  return z.object({
    jsonrpc: JsonRpcVersionSchema,
    id: z.never().optional(),
    method: z.literal(method),
    params,
    result: z.never().optional(),
    error: z.never().optional(),
  })
}

/** Create a schema for one error object with required application data. */
export function jsonRpcErrorObjectSchema<Data extends z.ZodType>(data: Data) {
  return z.object({
    code: z.number().int(),
    message: z.string(),
    data,
  })
}

/** Create a schema for one method-specific response. */
export function jsonRpcResponseSchema<
  Result extends z.ZodType,
  ErrorObject extends z.ZodType,
  Id extends z.ZodType,
>(result: Result, error: ErrorObject, id: Id) {
  return z.union([
    z.object({
      jsonrpc: JsonRpcVersionSchema,
      id,
      method: z.never().optional(),
      result,
      error: z.never().optional(),
    }),
    z.object({
      jsonrpc: JsonRpcVersionSchema,
      id,
      method: z.never().optional(),
      result: z.never().optional(),
      error,
    }),
  ])
}

/** Create one request that expects one response. */
export function jsonRpcRequest<Method extends string, Params>(
  id: JsonRpcId,
  method: Method,
  params: Params,
): JsonRpcRequest<Method, Params> {
  return { jsonrpc: JSON_RPC_VERSION, id, method, params }
}

/** Create one notification that receives no response. */
export function jsonRpcNotification<Method extends string, Params>(
  method: Method,
  params: Params,
): JsonRpcNotification<Method, Params> {
  return { jsonrpc: JSON_RPC_VERSION, method, params }
}

/** Create one successful response. */
export function jsonRpcResult<Result>(
  id: JsonRpcId,
  result: Result,
): JsonRpcResponse<Result, never> {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

/** Create one error response. */
export function jsonRpcError<ErrorData>(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: ErrorData,
): JsonRpcResponse<never, ErrorData> {
  const error = data === undefined ? { code, message } : { code, message, data }
  return { jsonrpc: JSON_RPC_VERSION, id, error }
}

/** Test whether one response contains a remote error value. */
export function isJsonRpcError<Result, ErrorData>(
  response: JsonRpcResponse<Result, ErrorData>,
): response is Extract<JsonRpcResponse<Result, ErrorData>, { error: unknown }> {
  return 'error' in response
}
