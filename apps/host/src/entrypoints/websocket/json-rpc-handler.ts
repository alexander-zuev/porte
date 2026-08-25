import { toErrorPayload } from '@host/infrastructure/errors/to-error-payload.ts'
import {
  HOST_APPLICATION_ERROR_CODE,
  HOST_APPLICATION_ERROR_MESSAGE,
  JSON_RPC_ERROR_CODES,
  JsonRpcReadError,
  handleJsonRpcRequest,
  jsonRpcError,
  readJsonRpcIncoming,
  type JsonRpcId,
  type JsonRpcMethodRegistry,
  type JsonRpcRegistryMethodMap,
  type JsonRpcRegistryNotificationMethod,
  type JsonRpcRegistryRequestMethod,
  type JsonRpcResponse,
} from '@porte/core/client'
import type { z } from 'zod'

type RequestMethod<
  Registry extends JsonRpcMethodRegistry,
  Method extends JsonRpcRegistryRequestMethod<Registry>,
> = Extract<JsonRpcRegistryMethodMap<Registry>[Method], { readonly kind: 'request' }>

type NotificationMethod<
  Registry extends JsonRpcMethodRegistry,
  Method extends JsonRpcRegistryNotificationMethod<Registry>,
> = Extract<JsonRpcRegistryMethodMap<Registry>[Method], { readonly kind: 'notification' }>

/** One typed handler for every inbound request in a JSON-RPC method table. */
export type JsonRpcMethodHandlers<Registry extends JsonRpcMethodRegistry, Context> = Readonly<{
  [Method in JsonRpcRegistryRequestMethod<Registry>]: (
    params: RequestMethod<Registry, Method>['params'],
    context: Context,
  ) => Promise<RequestMethod<Registry, Method>['result']>
}>

/** One typed handler for every inbound notification this server accepts. */
export type JsonRpcNotificationHandlers<
  Registry extends JsonRpcMethodRegistry,
  Context,
> = Readonly<{
  [Method in JsonRpcRegistryNotificationMethod<Registry>]?: (
    params: NotificationMethod<Registry, Method>['params'],
    context: Context,
  ) => Promise<void>
}>

/** Input for one JSON-RPC frame handler. */
export type JsonRpcHandlerInput<
  Registry extends JsonRpcMethodRegistry,
  Context,
  Id extends JsonRpcId = JsonRpcId,
> = {
  readonly methods: Registry
  readonly requestId: z.ZodType<Id>
  readonly handlers: JsonRpcMethodHandlers<Registry, Context>
  readonly notificationHandlers: JsonRpcNotificationHandlers<Registry, Context>
  readonly context: Context
}

/** Create one JSON-RPC onFrame that returns a response document or nothing. */
export function createJsonRpcHandler<
  Registry extends JsonRpcMethodRegistry,
  Context,
  Id extends JsonRpcId,
>(
  input: JsonRpcHandlerInput<Registry, Context, Id>,
): (frame: string) => Promise<JsonRpcResponse<unknown, unknown> | undefined> {
  return (frame) => handleFrame(frame, input)
}

async function handleFrame<Registry extends JsonRpcMethodRegistry, Context, Id extends JsonRpcId>(
  frame: string,
  input: JsonRpcHandlerInput<Registry, Context, Id>,
): Promise<JsonRpcResponse<unknown, unknown> | undefined> {
  try {
    const incoming = readJsonRpcIncoming(frame, input.methods, input.requestId)
    if (incoming.kind === 'notification') {
      const handler = input.notificationHandlers[incoming.data.method]
      if (handler === undefined) {
        throw new JsonRpcReadError({
          id: null,
          code: JSON_RPC_ERROR_CODES.methodNotFound,
          message: 'Method not found',
        })
      }
      await handler(incoming.data.params, input.context)
      return undefined
    }
    if (incoming.kind === 'response') {
      throw new JsonRpcReadError({
        id: null,
        code: JSON_RPC_ERROR_CODES.invalidRequest,
        message: 'Invalid Request',
      })
    }
    return await handleJsonRpcRequest(
      incoming.data,
      (params) => input.handlers[incoming.data.method](params, input.context),
      (cause) => ({
        code: HOST_APPLICATION_ERROR_CODE,
        message: HOST_APPLICATION_ERROR_MESSAGE,
        data: toErrorPayload(cause),
      }),
    )
  } catch (cause) {
    if (cause instanceof JsonRpcReadError) {
      return jsonRpcError(cause.id, cause.code, cause.message)
    }
    throw cause
  }
}
