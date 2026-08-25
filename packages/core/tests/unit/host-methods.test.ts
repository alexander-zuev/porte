import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
  HostControlMethods,
  type HostControlMethodMap,
  hostControlNotificationSchema,
  hostControlRequestSchema,
  hostControlResponseSchema,
} from '../../src/relay/host-control-methods.ts'
import {
  HostConversationMethods,
  type HostConversationMethodMap,
  hostConversationNotificationSchema,
} from '../../src/relay/host-conversation-methods.ts'
import type { HostRequestId } from '../../src/relay/host-json-rpc.ts'
import { JSON_RPC_METHOD_KINDS } from '../../src/websocket/json-rpc.ts'

const HOST_REQUEST_ID = '0195394f-c2d0-7a6e-8d9f-123456789abc'

describe('Host JSON-RPC methods', () => {
  it('separates the control registry', () => {
    expect(Object.keys(HostControlMethods)).toEqual([
      'conversations.list',
      'conversation.create',
      'conversation.attach',
      'conversation.updated',
      'conversation.removed',
    ])
  })

  it('separates the conversation registry', () => {
    expect(Object.keys(HostConversationMethods)).toEqual([
      'conversation.close',
      'turn.start',
      'turn.cancel',
      'conversation.configuration.set',
      'permission.answer',
      'elicitation.answer',
      'conversation.state',
      'conversation.event',
    ])
  })

  it('uses requests only when a method needs a response', () => {
    expect(HostControlMethods['conversation.updated'].kind).toBe(JSON_RPC_METHOD_KINDS.notification)
    expect(HostConversationMethods['turn.start'].kind).toBe(JSON_RPC_METHOD_KINDS.request)
  })

  it('does not expose list revision state', () => {
    expect(
      HostControlMethods['conversations.list'].result.safeParse({ conversations: [] }).success,
    ).toBe(true)
  })

  it('requires a UUID v7 request identifier', () => {
    const schema = hostControlRequestSchema('conversations.list')
    const request = {
      jsonrpc: '2.0',
      id: HOST_REQUEST_ID,
      method: 'conversations.list',
      params: { limit: 50 },
    }
    expect(schema.safeParse(request).success).toBe(true)
    expect(schema.safeParse({ ...request, id: 'request:1' }).success).toBe(false)
    expectTypeOf<z.infer<typeof schema>['id']>().toEqualTypeOf<HostRequestId>()
  })

  it('does not repeat the conversation identifier on data methods', () => {
    expect(
      HostConversationMethods['turn.cancel'].params.safeParse({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
      }).success,
    ).toBe(false)
  })

  it('derives payload types from each registry', () => {
    expectTypeOf<HostControlMethodMap['conversation.attach']['result']>().toEqualTypeOf<null>()
    expectTypeOf<HostConversationMethodMap['turn.start']['params']['turnId']>().toBeString()
    expectTypeOf<
      HostConversationMethodMap['conversation.event']['kind']
    >().toEqualTypeOf<'notification'>()
  })

  it('uses one strict application error shape', () => {
    const schema = hostControlResponseSchema('conversation.attach')
    const error = {
      code: -32_000,
      message: 'Application error',
      data: { _tag: 'HostOfflineError', message: 'Host is offline' },
    }
    expect(schema.safeParse({ jsonrpc: '2.0', id: HOST_REQUEST_ID, error }).success).toBe(true)
    expect(
      schema.safeParse({ jsonrpc: '2.0', id: HOST_REQUEST_ID, error: { ...error, extra: true } })
        .success,
    ).toBe(false)
  })

  it('does not permit identifiers on notifications', () => {
    const control = hostControlNotificationSchema('conversation.removed')
    const conversation = hostConversationNotificationSchema('conversation.event')
    expect(
      control.safeParse({
        jsonrpc: '2.0',
        id: HOST_REQUEST_ID,
        method: 'conversation.removed',
        params: { conversationId: 'conversation-1' },
      }).success,
    ).toBe(false)
    expect(
      conversation.safeParse({
        jsonrpc: '2.0',
        id: HOST_REQUEST_ID,
        method: 'conversation.event',
        params: { event: { type: 'turn.started', turnId: 'turn-1' } },
      }).success,
    ).toBe(false)
  })
})
