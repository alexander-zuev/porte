import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { JSON_RPC_ERROR_CODES, decodeJsonRpc, jsonRpcError } from '../../src/websocket/json-rpc.ts'

describe('JSON-RPC 2.0 codec', () => {
  it('decodes the official positional request example', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","method":"subtract","params":[42,23],"id":1}')

    expect(decoded).toEqual(
      Result.ok({ jsonrpc: '2.0', method: 'subtract', params: [42, 23], id: 1 }),
    )
  })

  it('decodes the official notification example', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","method":"update","params":[1,2,3,4,5]}')

    expect(decoded).toEqual(
      Result.ok({ jsonrpc: '2.0', method: 'update', params: [1, 2, 3, 4, 5] }),
    )
  })

  it('decodes the official success response example', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","result":19,"id":1}')

    expect(decoded).toEqual(Result.ok({ jsonrpc: '2.0', result: 19, id: 1 }))
  })

  it('keeps a remote error response as a value', () => {
    const decoded = decodeJsonRpc(
      '{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":"1"}',
    )

    expect(decoded).toEqual(
      Result.ok({
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32_601, message: 'Method not found' },
      }),
    )
  })

  it('returns the standard parse error for invalid JSON', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0"')

    expect(decoded.isErr()).toBe(true)
    if (decoded.isErr()) {
      expect(decoded.error).toEqual({
        code: JSON_RPC_ERROR_CODES.parseError,
        message: 'Parse error',
      })
    }
  })

  it('returns invalid request for a non-protocol object', () => {
    const decoded = decodeJsonRpc('{"jsonrpc":"2.0","method":1}')

    expect(decoded.isErr()).toBe(true)
    if (decoded.isErr()) {
      expect(decoded.error).toEqual({
        code: JSON_RPC_ERROR_CODES.invalidRequest,
        message: 'Invalid Request',
      })
    }
  })

  it('accepts and removes unknown envelope members', () => {
    const decoded = decodeJsonRpc(
      '{"jsonrpc":"2.0","method":"update","params":[],"traceId":"trace-1"}',
    )

    expect(decoded).toEqual(Result.ok({ jsonrpc: '2.0', method: 'update', params: [] }))
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

    expect(decoded.isErr()).toBe(true)
  })

  it('rejects a response with result and error', () => {
    const decoded = decodeJsonRpc(
      '{"jsonrpc":"2.0","id":1,"result":1,"error":{"code":-32603,"message":"x"}}',
    )

    expect(decoded.isErr()).toBe(true)
  })
})
