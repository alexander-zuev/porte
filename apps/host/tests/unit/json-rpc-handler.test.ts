import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import {
  ConversationBusyError,
  HOST_APPLICATION_ERROR_CODE,
  HostRequestIdSchema,
  JSON_RPC_ERROR_CODES,
  JSON_RPC_METHOD_KINDS,
  createHostRequestId,
  jsonRpcNotification,
  jsonRpcRequest,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const methods = {
  ping: {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({}),
    result: z.literal('pong'),
  },
  tick: {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({}),
  },
} as const

describe('createJsonRpcHandler', () => {
  it('returns a result document', async () => {
    const onFrame = handler(async () => 'pong')
    const id = createHostRequestId()
    await expect(onFrame(JSON.stringify(jsonRpcRequest(id, 'ping', {})))).resolves.toEqual({
      jsonrpc: '2.0',
      id,
      result: 'pong',
    })
  })

  it('returns a parse error with a null id', async () => {
    const onFrame = handler(async () => 'pong')
    await expect(onFrame('{"jsonrpc":"2.0"')).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: JSON_RPC_ERROR_CODES.parseError, message: 'Parse error' },
    })
  })

  it('returns method not found with the request id', async () => {
    const onFrame = handler(async () => 'pong')
    const id = createHostRequestId()
    await expect(onFrame(JSON.stringify(jsonRpcRequest(id, 'missing', {})))).resolves.toEqual({
      jsonrpc: '2.0',
      id,
      error: { code: JSON_RPC_ERROR_CODES.methodNotFound, message: 'Method not found' },
    })
  })

  it('returns a handler throw as an application error', async () => {
    const onFrame = handler(async () => {
      throw new ConversationBusyError()
    })
    const id = createHostRequestId()
    await expect(onFrame(JSON.stringify(jsonRpcRequest(id, 'ping', {})))).resolves.toEqual({
      jsonrpc: '2.0',
      id,
      error: {
        code: HOST_APPLICATION_ERROR_CODE,
        message: 'Application error',
        data: {
          _tag: 'ConversationBusyError',
          message: new ConversationBusyError().message,
        },
      },
    })
  })

  it('returns nothing for a notification', async () => {
    const onFrame = handler(async () => 'pong')
    await expect(onFrame(JSON.stringify(jsonRpcNotification('tick', {})))).resolves.toBeUndefined()
  })
})

function handler(ping: () => Promise<'pong'>) {
  return createJsonRpcHandler({
    methods,
    requestId: HostRequestIdSchema,
    handlers: { ping },
    context: undefined,
  })
}
