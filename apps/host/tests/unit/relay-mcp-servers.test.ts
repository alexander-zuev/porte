import type { CreateSession } from '@host/application/ports/coding-agent.ts'
import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import {
  ConversationSummarySchema,
  HostControlMethods,
  HostRequestIdSchema,
  JSON_RPC_ERROR_CODES,
  createHostRequestId,
  jsonRpcRequest,
  type ConversationSummary,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const CWD = 'C:/work/repo'

describe('relay MCP servers', () => {
  it('rejects conversation.create before the host handler runs', async () => {
    let calls = 0
    const onFrame = createJsonRpcHandler({
      methods: HostControlMethods,
      requestId: HostRequestIdSchema,
      handlers: {
        'conversations.list': async () => {
          throw new Error('list was called')
        },
        'conversation.create': async () => {
          calls += 1
          return summary()
        },
        'conversation.attach': async () => {
          throw new Error('attach was called')
        },
      },
      notificationHandlers: {},
      context: undefined,
    })
    const id = createHostRequestId()
    const payloads = [
      { cwd: CWD, mcpServers: [] },
      { cwd: CWD, mcpServers: [{ command: 'node', args: ['evil.js'] }] },
      { cwd: CWD, mcpServers: [{ command: 'bash', args: ['-c', 'id'], env: { HOME: '/tmp' } }] },
      { cwd: CWD, command: 'bash' },
    ]

    const results = await Promise.all(
      payloads.map((params) =>
        onFrame(JSON.stringify(jsonRpcRequest(id, 'conversation.create', params))),
      ),
    )
    for (const result of results) {
      expect(result).toEqual({
        jsonrpc: '2.0',
        id,
        error: { code: JSON_RPC_ERROR_CODES.invalidParams, message: 'Invalid params' },
      })
    }
    expect(calls).toBe(0)
  })

  it('delivers a directory-only create to the handler', async () => {
    const seen: CreateSession[] = []
    const onFrame = createJsonRpcHandler({
      methods: HostControlMethods,
      requestId: HostRequestIdSchema,
      handlers: {
        'conversations.list': async () => {
          throw new Error('list was called')
        },
        'conversation.create': async (params) => {
          seen.push(params)
          return summary()
        },
        'conversation.attach': async () => {
          throw new Error('attach was called')
        },
      },
      notificationHandlers: {},
      context: undefined,
    })
    const id = createHostRequestId()

    await expect(
      onFrame(JSON.stringify(jsonRpcRequest(id, 'conversation.create', { cwd: CWD }))),
    ).resolves.toMatchObject({ jsonrpc: '2.0', id, result: { cwd: CWD } })
    expect(seen).toEqual([{ cwd: CWD }])
  })
})

function summary(): ConversationSummary {
  return ConversationSummarySchema.parse({
    id: 'session-1',
    cwd: CWD,
    gitRoot: CWD,
    title: '',
    updatedAt: '2026-10-15T12:00:00.000Z',
  })
}
