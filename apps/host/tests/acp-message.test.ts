import { describe, expect, it } from 'vitest'

import { parseAcpLine } from '../src/adapters/acp/message.ts'

describe('parseAcpLine', () => {
  it('parses a session update', () => {
    const parsed = parseAcpLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'session-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Done' },
          },
        },
      }),
    )
    expect(parsed).toEqual({
      kind: 'update',
      notification: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done' },
        },
      },
    })
  })

  it('parses an incoming request instead of a response', () => {
    const parsed = parseAcpLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'fs/write_text_file',
        params: { path: '/tmp/a.txt', content: 'pong\n' },
      }),
    )
    expect(parsed).toEqual({
      kind: 'incoming',
      id: 1,
      method: 'fs/write_text_file',
      params: { path: '/tmp/a.txt', content: 'pong\n' },
    })
  })

  it('parses a JSON-RPC response', () => {
    const parsed = parseAcpLine(
      JSON.stringify({ jsonrpc: '2.0', id: 4, result: { stopReason: 'end_turn' } }),
    )
    expect(parsed).toEqual({
      kind: 'response',
      id: 4,
      result: { stopReason: 'end_turn' },
      error: undefined,
    })
  })
})
