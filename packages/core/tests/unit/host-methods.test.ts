import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
  HostMethods,
  type HostMethodMap,
  type HostRequestId,
  hostNotificationSchema,
  hostRequestSchema,
  hostResponseSchema,
} from '../../src/relay/host-methods.ts'
import { JSON_RPC_METHOD_KINDS } from '../../src/websocket/json-rpc.ts'

const HOST_REQUEST_ID = '0195394f-c2d0-7a6e-8d9f-123456789abc'

describe('Host JSON-RPC methods', () => {
  it('defines the complete request registry', () => {
    const requests = Object.entries(HostMethods)
      .filter(([, definition]) => definition.kind === JSON_RPC_METHOD_KINDS.request)
      .map(([method]) => method)

    expect(requests).toEqual([
      'conversations.list',
      'conversation.read',
      'conversation.create',
      'conversation.close',
      'turn.start',
      'turn.cancel',
      'conversation.configuration.set',
      'permission.answer',
      'elicitation.answer',
    ])
  })

  it('defines the complete notification registry', () => {
    const notifications = Object.entries(HostMethods)
      .filter(([, definition]) => definition.kind === JSON_RPC_METHOD_KINDS.notification)
      .map(([method]) => method)

    expect(notifications).toEqual([
      'conversation.updated',
      'conversation.removed',
      'conversation.state',
      'conversation.event',
    ])
  })

  it('parses one bounded conversation list result', () => {
    const result = HostMethods['conversations.list'].result.safeParse({
      conversations: [],
      revision: 0,
    })

    expect(result.success).toBe(true)
  })

  it('requires a UUID v7 Host request identifier', () => {
    const schema = hostRequestSchema('conversations.list')
    const valid = {
      jsonrpc: '2.0',
      id: HOST_REQUEST_ID,
      method: 'conversations.list',
      params: { limit: 50 },
    }
    const invalid = { ...valid, id: 'request:1' }

    expect(schema.safeParse(valid).success).toBe(true)
    expect(schema.safeParse(invalid).success).toBe(false)
    expectTypeOf<z.infer<typeof schema>['id']>().toEqualTypeOf<HostRequestId>()
  })

  it('rejects unknown command parameter fields', () => {
    const result = HostMethods['conversation.create'].params.safeParse({
      creationId: HOST_REQUEST_ID,
      cwd: '/tmp',
      extra: true,
    })

    expect(result.success).toBe(false)
  })

  it('derives the selected method params and result types', () => {
    expectTypeOf<HostMethodMap['turn.start']['params']['turnId']>().toBeString()
    expectTypeOf<HostMethodMap['turn.start']['result']>().toEqualTypeOf<null>()
    expectTypeOf<HostMethodMap['conversation.event']['kind']>().toEqualTypeOf<'notification'>()
  })

  it('uses one strict application error shape', () => {
    const schema = hostResponseSchema('turn.cancel')
    const response = {
      jsonrpc: '2.0',
      id: HOST_REQUEST_ID,
      error: {
        code: -32_000,
        message: 'Application error',
        data: { _tag: 'HostOfflineError', message: 'Host is offline' },
      },
    }

    expect(schema.safeParse(response).success).toBe(true)
    expect(
      schema.safeParse({
        ...response,
        error: { ...response.error, data: { ...response.error.data, extra: true } },
      }).success,
    ).toBe(false)
  })

  it('does not permit an identifier on a Host notification', () => {
    const result = hostNotificationSchema('conversation.removed').safeParse({
      jsonrpc: '2.0',
      id: HOST_REQUEST_ID,
      method: 'conversation.removed',
      params: { conversationId: 'conversation-1', revision: 1 },
    })

    expect(result.success).toBe(false)
  })

  it('requires complete state for reconnect repair', () => {
    const result = HostMethods['conversation.state'].params.safeParse({
      conversationId: 'conversation-1',
      throughEventSequence: 1,
      state: {
        turn: { state: 'idle' },
        items: [],
        tools: [],
        plans: [],
        pending: { permissions: [], elicitations: [] },
      },
    })

    expect(result.success).toBe(true)
  })
})
