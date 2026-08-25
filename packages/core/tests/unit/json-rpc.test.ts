import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { sendJsonRpcFrame } from '../../src/websocket/json-rpc-send.ts'
import {
  JSON_RPC_ERROR_CODES,
  JSON_RPC_MAX_FRAME_BYTES,
  JSON_RPC_METHOD_KINDS,
  JsonRpcReadError,
  JsonRpcTextSchema,
  answerJsonRpcRequest,
  decodeJsonRpc,
  jsonRpcError,
  jsonRpcNotification,
  jsonRpcRequest,
  jsonRpcResult,
  readJsonRpcIncoming,
  readJsonRpcTextFrame,
} from '../../src/websocket/json-rpc.ts'

const methods = {
  add: {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ a: z.number(), b: z.number() }),
    result: z.number(),
  },
  ping: {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({}),
  },
} as const

const requestId = z.number()

describe('JSON-RPC 2.0 codec', () => {
  it('decodes the official positional request example', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","method":"subtract","params":[42,23],"id":1}')

    expect(decoded).toEqual({
      success: true,
      data: { jsonrpc: '2.0', method: 'subtract', params: [42, 23], id: 1 },
    })
  })

  it('decodes the official notification example', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","method":"update","params":[1,2,3,4,5]}')

    expect(decoded).toEqual({
      success: true,
      data: { jsonrpc: '2.0', method: 'update', params: [1, 2, 3, 4, 5] },
    })
  })

  it('decodes the official success response example', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","result":19,"id":1}')

    expect(decoded).toEqual({ success: true, data: { jsonrpc: '2.0', result: 19, id: 1 } })
  })

  it('keeps a remote error response as a value', () => {
    const decoded = decodeJsonRpc(
      '{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":"1"}',
    )

    expect(decoded).toEqual({
      success: true,
      data: {
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32_601, message: 'Method not found' },
      },
    })
  })

  it('returns the standard parse error for invalid JSON', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0"')

    expect(decoded.success).toBe(false)
    if (!decoded.success) {
      expect(decoded.error).toEqual({
        code: JSON_RPC_ERROR_CODES.parseError,
        message: 'Parse error',
      })
    }
  })

  it('returns invalid request for a non-protocol object', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","method":1}')

    expect(decoded.success).toBe(false)
    if (!decoded.success) {
      expect(decoded.error).toEqual({
        code: JSON_RPC_ERROR_CODES.invalidRequest,
        message: 'Invalid Request',
      })
    }
  })

  it('rejects unknown envelope members', () => {
    const decoded = decodeJsonRpc(
      '{"jsonrpc":"2.0","method":"update","params":[],"traceId":"trace-1"}',
    )

    expect(decoded.success).toBe(false)
  })

  it('requires the caller to select an error code', () => {
    const response = jsonRpcError('request-1', JSON_RPC_ERROR_CODES.internalError, 'Internal error')

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      error: { code: -32_603, message: 'Internal error' },
    })
  })

  it('rejects batches in the Porte WebSocket profile', () => {
    const decoded = decodeJsonRpc('[{"jsonrpc":"2.0","method":"update"}]')

    expect(decoded.success).toBe(false)
  })

  it('rejects a response with result and error', () => {
    const decoded = decodeJsonRpc(
      '{"jsonrpc":"2.0","id":1,"result":1,"error":{"code":-32603,"message":"x"}}',
    )

    expect(decoded.success).toBe(false)
  })
})

describe('readJsonRpcIncoming', () => {
  it('classifies a request, notification, and response', () => {
    expect(
      readJsonRpcIncoming(
        JSON.stringify(jsonRpcRequest(1, 'add', { a: 2, b: 3 })),
        methods,
        requestId,
      ),
    ).toEqual({
      kind: 'request',
      data: { id: 1, method: 'add', params: { a: 2, b: 3 } },
    })
    expect(
      readJsonRpcIncoming(JSON.stringify(jsonRpcNotification('ping', {})), methods, requestId),
    ).toEqual({
      kind: 'notification',
      data: { method: 'ping', params: {} },
    })
    expect(
      readJsonRpcIncoming(JSON.stringify(jsonRpcResult(1, 5)), methods, requestId),
    ).toMatchObject({ kind: 'response', data: { id: 1, result: 5 } })
  })

  it('throws on parse error', () => {
    expect(() => readJsonRpcIncoming('{"jsonrpc":"2.0"', methods, requestId)).toThrow(
      JsonRpcReadError,
    )
    try {
      readJsonRpcIncoming('{"jsonrpc":"2.0"', methods, requestId)
    } catch (cause) {
      expect(cause).toMatchObject({
        id: null,
        code: JSON_RPC_ERROR_CODES.parseError,
      })
    }
  })

  it('throws method not found with the request id', () => {
    expect(() =>
      readJsonRpcIncoming(
        JSON.stringify(jsonRpcRequest(1, 'missing', { a: 1 })),
        methods,
        requestId,
      ),
    ).toThrow(JsonRpcReadError)
    try {
      readJsonRpcIncoming(
        JSON.stringify(jsonRpcRequest(1, 'missing', { a: 1 })),
        methods,
        requestId,
      )
    } catch (cause) {
      expect(cause).toMatchObject({
        id: 1,
        code: JSON_RPC_ERROR_CODES.methodNotFound,
      })
    }
  })

  it('throws invalid params with the request id', () => {
    try {
      readJsonRpcIncoming(JSON.stringify(jsonRpcRequest(1, 'add', { a: 'x' })), methods, requestId)
    } catch (cause) {
      expect(cause).toMatchObject({
        id: 1,
        code: JSON_RPC_ERROR_CODES.invalidParams,
      })
    }
  })
})

describe('answerJsonRpcRequest', () => {
  it('returns a result document', async () => {
    const response = await answerJsonRpcRequest(
      { id: 1, params: { a: 2 } },
      async () => 4,
      () => {
        return { code: -32_000, message: 'Application error' }
      },
    )
    expect(response).toEqual({ jsonrpc: '2.0', id: 1, result: 4 })
  })

  it('maps a handler throw through mapError', async () => {
    const response = await answerJsonRpcRequest(
      { id: 1, params: {} },
      async () => {
        throw new Error('busy')
      },
      (cause) => ({
        code: -32_000,
        message: 'Application error',
        data: {
          _tag: 'ConversationBusyError',
          message: cause instanceof Error ? cause.message : '',
        },
      }),
    )
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32_000,
        message: 'Application error',
        data: { _tag: 'ConversationBusyError', message: 'busy' },
      },
    })
  })
})

describe('readJsonRpcTextFrame', () => {
  it('closes 1003 for a non-text frame', () => {
    expect(readJsonRpcTextFrame(JsonRpcTextSchema.safeParse(new Uint8Array()))).toEqual({
      ok: false,
      close: { code: 1003, reason: 'WebSocket message must be text' },
    })
  })

  it('accepts a text frame under the cap', () => {
    expect(readJsonRpcTextFrame(JsonRpcTextSchema.safeParse('{"jsonrpc":"2.0"}'))).toEqual({
      ok: true,
      frame: '{"jsonrpc":"2.0"}',
    })
  })

  it('closes 1009 for a frame over the cap', () => {
    expect(
      readJsonRpcTextFrame(JsonRpcTextSchema.safeParse('x'.repeat(JSON_RPC_MAX_FRAME_BYTES + 1))),
    ).toEqual({
      ok: false,
      close: { code: 1009, reason: 'WebSocket message too big' },
    })
  })
})

describe('sendJsonRpcFrame', () => {
  it('retries a write that never left, then succeeds', async () => {
    const attempts = { count: 0 }
    await sendJsonRpcFrame(() => {
      attempts.count += 1
      return attempts.count > 1
    })
    expect(attempts.count).toBe(2)
  })

  it('does not retry a write that may have sent', async () => {
    await expect(
      sendJsonRpcFrame(() => {
        throw new Error('broken pipe')
      }),
    ).rejects.toMatchObject({ neverLeft: false })
  })
})
