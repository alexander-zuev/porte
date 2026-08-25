import { TaggedError } from 'better-result'
import { z } from 'zod'

import type { FailureClassification } from '../errors/failure-classification.ts'

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

/** One complete typed JSON-RPC method registry. */
export type JsonRpcMethodRegistry = Readonly<Record<string, JsonRpcMethodDefinition>>

/** Every method name in one JSON-RPC registry. */
export type JsonRpcRegistryMethod<Registry extends JsonRpcMethodRegistry> = keyof Registry & string

/** Every request method in one JSON-RPC registry. */
export type JsonRpcRegistryRequestMethod<Registry extends JsonRpcMethodRegistry> = {
  [
    Method in JsonRpcRegistryMethod<Registry>
  ]: Registry[Method]['kind'] extends typeof JSON_RPC_METHOD_KINDS.request ? Method : never
}[JsonRpcRegistryMethod<Registry>]

/** Every notification method in one JSON-RPC registry. */
export type JsonRpcRegistryNotificationMethod<Registry extends JsonRpcMethodRegistry> = Exclude<
  JsonRpcRegistryMethod<Registry>,
  JsonRpcRegistryRequestMethod<Registry>
>

/** Parsed method payloads derived from one JSON-RPC registry. */
export type JsonRpcRegistryMethodMap<Registry extends JsonRpcMethodRegistry> = {
  [Method in JsonRpcRegistryMethod<Registry>]: Registry[Method] extends {
    readonly kind: typeof JSON_RPC_METHOD_KINDS.request
    readonly params: infer Params extends z.ZodType
    readonly result: infer Result extends z.ZodType
  }
    ? {
        readonly kind: typeof JSON_RPC_METHOD_KINDS.request
        readonly params: z.infer<Params>
        readonly result: z.infer<Result>
      }
    : Registry[Method] extends {
          readonly kind: typeof JSON_RPC_METHOD_KINDS.notification
          readonly params: infer Params extends z.ZodType
        }
      ? {
          readonly kind: typeof JSON_RPC_METHOD_KINDS.notification
          readonly params: z.infer<Params>
        }
      : never
}

const JsonRpcVersionSchema = z.literal(JSON_RPC_VERSION)
const JsonRpcParamsSchema = z.union([z.record(z.string(), z.json()), z.array(z.json())])
export type JsonRpcParams = z.infer<typeof JsonRpcParamsSchema>

/** A request identifier can be a string, number, or null under JSON-RPC 2.0. */
export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()])
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>

export const JsonRpcRequestSchema = z.strictObject({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.string(),
  params: JsonRpcParamsSchema.optional(),
  result: z.never().optional(),
  error: z.never().optional(),
})

export const JsonRpcNotificationSchema = z.strictObject({
  jsonrpc: JsonRpcVersionSchema,
  id: z.never().optional(),
  method: z.string(),
  params: JsonRpcParamsSchema.optional(),
  result: z.never().optional(),
  error: z.never().optional(),
})

export const JsonRpcErrorObjectSchema = z.strictObject({
  code: z.number().int(),
  message: z.string(),
  data: z.json().optional(),
})

export const JsonRpcSuccessResponseSchema = z.strictObject({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.never().optional(),
  result: z.json(),
  error: z.never().optional(),
})

export const JsonRpcErrorResponseSchema = z.strictObject({
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

/** Largest JSON-RPC text frame either peer accepts. Our cap; Cloudflare receives up to 32 MiB. */
export const JSON_RPC_MAX_FRAME_BYTES = 8 * 1024 * 1024

/** Text WebSocket payload before the JSON-RPC size bound. */
export const JsonRpcTextSchema = z.string()

/** Close to send when an inbound WebSocket message is not a bounded JSON-RPC text frame. */
export type JsonRpcTextFrameClose = {
  readonly code: 1003 | 1009
  readonly reason: string
}

/** One inbound WebSocket message after the text and size checks. */
export type JsonRpcTextFrameRead =
  | { readonly ok: true; readonly frame: string }
  | { readonly ok: false; readonly close: JsonRpcTextFrameClose }

type JsonRpcTextParse =
  | { readonly success: true; readonly data: string }
  | { readonly success: false }

/**
 * Read one WebSocket message as a bounded JSON-RPC text frame.
 *
 * Parse with {@link JsonRpcTextSchema} first. Not text closes 1003. Over the
 * cap closes 1009.
 */
export function readJsonRpcTextFrame(parsed: JsonRpcTextParse): JsonRpcTextFrameRead {
  if (!parsed.success) {
    return { ok: false, close: { code: 1003, reason: 'WebSocket message must be text' } }
  }
  if (new TextEncoder().encode(parsed.data).byteLength > JSON_RPC_MAX_FRAME_BYTES) {
    return { ok: false, close: { code: 1009, reason: 'WebSocket message too big' } }
  }
  return { ok: true, frame: parsed.data }
}

/** A standard protocol error found while decoding one JSON-RPC document. */
export type JsonRpcDecodeError =
  | { readonly code: -32_700; readonly message: 'Parse error' }
  | { readonly code: -32_600; readonly message: 'Invalid Request' }

/** The parsed JSON-RPC document or its standard protocol error. */
export type JsonRpcDecodeResult =
  | { readonly success: true; readonly data: JsonRpcDocument }
  | { readonly success: false; readonly error: JsonRpcDecodeError }

/** Decode one JSON-RPC document without owning the transport response. */
export function decodeJsonRpc(text: string): JsonRpcDecodeResult {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return {
      success: false,
      error: { code: JSON_RPC_ERROR_CODES.parseError, message: 'Parse error' },
    }
  }

  const parsed = JsonRpcDocumentSchema.safeParse(value)
  if (parsed.success) return { success: true, data: parsed.data }

  return {
    success: false,
    error: { code: JSON_RPC_ERROR_CODES.invalidRequest, message: 'Invalid Request' },
  }
}

type JsonRpcReadErrorCode =
  | typeof JSON_RPC_ERROR_CODES.parseError
  | typeof JSON_RPC_ERROR_CODES.invalidRequest
  | typeof JSON_RPC_ERROR_CODES.methodNotFound
  | typeof JSON_RPC_ERROR_CODES.invalidParams

/** Reading one inbound JSON-RPC document against the method table failed. */
export class JsonRpcReadError extends TaggedError('JsonRpcReadError')<{
  id: JsonRpcId
  code: JsonRpcReadErrorCode
  message: string
  classification: FailureClassification
}> {
  constructor(args: { id: JsonRpcId; code: JsonRpcReadErrorCode; message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** One typed inbound request selected from a JSON-RPC method table. */
export type JsonRpcInboundRequest<Registry extends JsonRpcMethodRegistry, Id> = {
  [Method in JsonRpcRegistryRequestMethod<Registry>]: {
    readonly id: Id
    readonly method: Method
    readonly params: Extract<
      JsonRpcRegistryMethodMap<Registry>[Method],
      { readonly kind: typeof JSON_RPC_METHOD_KINDS.request }
    >['params']
  }
}[JsonRpcRegistryRequestMethod<Registry>]

/** One typed inbound notification selected from a JSON-RPC method table. */
export type JsonRpcInboundNotification<Registry extends JsonRpcMethodRegistry> = {
  [Method in JsonRpcRegistryNotificationMethod<Registry>]: {
    readonly method: Method
    readonly params: Extract<
      JsonRpcRegistryMethodMap<Registry>[Method],
      { readonly kind: typeof JSON_RPC_METHOD_KINDS.notification }
    >['params']
  }
}[JsonRpcRegistryNotificationMethod<Registry>]

/** One inbound JSON-RPC document after the method table has classified it. */
export type JsonRpcIncoming<Registry extends JsonRpcMethodRegistry, Id> =
  | { readonly kind: 'request'; readonly data: JsonRpcInboundRequest<Registry, Id> }
  | { readonly kind: 'notification'; readonly data: JsonRpcInboundNotification<Registry> }
  | { readonly kind: 'response'; readonly data: z.infer<typeof JsonRpcResponseSchema> }

/** Application failure to put in a JSON-RPC error response. */
export type JsonRpcApplicationError = {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

/** Read one inbound JSON-RPC document against a method table. Throws JsonRpcReadError. */
export function readJsonRpcIncoming<Registry extends JsonRpcMethodRegistry, Id extends JsonRpcId>(
  text: string,
  methods: Registry,
  requestId: z.ZodType<Id>,
): JsonRpcIncoming<Registry, Id> {
  const decoded = decodeJsonRpc(text)
  if (!decoded.success) {
    throw new JsonRpcReadError({
      id: null,
      code: decoded.error.code,
      message: decoded.error.message,
    })
  }

  if (isJsonRpcResponse(decoded.data)) {
    return { kind: 'response', data: decoded.data }
  }

  if (isJsonRpcRequest(decoded.data)) {
    return readRequest(decoded.data, methods, requestId)
  }

  if (isJsonRpcNotification(decoded.data)) {
    return readNotification(decoded.data, methods)
  }

  throw new JsonRpcReadError({
    id: null,
    code: JSON_RPC_ERROR_CODES.invalidRequest,
    message: 'Invalid Request',
  })
}

/** Run one request handler and return the JSON-RPC response document. */
export async function answerJsonRpcRequest<Params, Result>(
  inbound: { readonly id: JsonRpcId; readonly params: Params },
  handler: (params: Params) => Promise<Result>,
  mapError: (cause: unknown) => JsonRpcApplicationError,
): Promise<JsonRpcResponse<Result, unknown>> {
  try {
    return jsonRpcResult(inbound.id, await handler(inbound.params))
  } catch (cause) {
    const mapped = mapError(cause)
    return jsonRpcError(inbound.id, mapped.code, mapped.message, mapped.data)
  }
}

function readRequest<Registry extends JsonRpcMethodRegistry, Id extends JsonRpcId>(
  document: z.infer<typeof JsonRpcRequestSchema>,
  methods: Registry,
  requestId: z.ZodType<Id>,
): JsonRpcIncoming<Registry, Id> {
  const id = requestId.safeParse(document.id)
  if (!id.success) {
    throw new JsonRpcReadError({
      id: null,
      code: JSON_RPC_ERROR_CODES.invalidRequest,
      message: 'Invalid Request',
    })
  }

  const definition = methods[document.method]
  if (definition === undefined || definition.kind !== JSON_RPC_METHOD_KINDS.request) {
    throw new JsonRpcReadError({
      id: id.data,
      code: JSON_RPC_ERROR_CODES.methodNotFound,
      message: 'Method not found',
    })
  }

  const params = definition.params.safeParse(document.params)
  if (!params.success) {
    throw new JsonRpcReadError({
      id: id.data,
      code: JSON_RPC_ERROR_CODES.invalidParams,
      message: 'Invalid params',
    })
  }

  return {
    kind: 'request',
    // SAFETY: method and params were parsed from the same request entry in `methods`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Restoring the correlated method/params pair the registry lookup lost.
    data: {
      id: id.data,
      method: document.method,
      params: params.data,
    } as JsonRpcInboundRequest<Registry, Id>,
  }
}

function readNotification<Registry extends JsonRpcMethodRegistry, Id extends JsonRpcId>(
  document: z.infer<typeof JsonRpcNotificationSchema>,
  methods: Registry,
): JsonRpcIncoming<Registry, Id> {
  const definition = methods[document.method]
  if (definition === undefined || definition.kind !== JSON_RPC_METHOD_KINDS.notification) {
    throw new JsonRpcReadError({
      id: null,
      code: JSON_RPC_ERROR_CODES.methodNotFound,
      message: 'Method not found',
    })
  }

  const params = definition.params.safeParse(document.params)
  if (!params.success) {
    throw new JsonRpcReadError({
      id: null,
      code: JSON_RPC_ERROR_CODES.invalidParams,
      message: 'Invalid params',
    })
  }

  return {
    kind: 'notification',
    // SAFETY: method and params were parsed from the same notification entry in `methods`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Restoring the correlated method/params pair the registry lookup lost.
    data: {
      method: document.method,
      params: params.data,
    } as JsonRpcInboundNotification<Registry>,
  }
}

function isJsonRpcRequest(
  document: JsonRpcDocument,
): document is z.infer<typeof JsonRpcRequestSchema> {
  return 'method' in document && 'id' in document
}

function isJsonRpcNotification(
  document: JsonRpcDocument,
): document is z.infer<typeof JsonRpcNotificationSchema> {
  return 'method' in document && !('id' in document)
}

function isJsonRpcResponse(
  document: JsonRpcDocument,
): document is z.infer<typeof JsonRpcResponseSchema> {
  return 'result' in document || 'error' in document
}

/** Create a schema for one method-specific request. */
export function jsonRpcRequestSchema<
  Method extends string,
  Params extends z.ZodType,
  Id extends z.ZodType,
>(method: Method, params: Params, id: Id) {
  return z.strictObject({
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
  return z.strictObject({
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
  return z.strictObject({
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
    z.strictObject({
      jsonrpc: JsonRpcVersionSchema,
      id,
      method: z.never().optional(),
      result,
      error: z.never().optional(),
    }),
    z.strictObject({
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
