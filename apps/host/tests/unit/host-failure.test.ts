import { classifyHostStop } from '@host/entrypoints/mcp/host-failure.ts'
import { AcpStartError } from '@host/infrastructure/acp/error.ts'
import {
  WebSocketHandlerError,
  WebSocketHandshakeRefused,
  WebSocketProtocolClose,
} from '@host/infrastructure/websocket/websocket-errors.ts'
import { describe, expect, it } from 'vitest'

describe('classifyHostStop', () => {
  it('waits for the person on a refused credential, a refused route, or a Grok that will not start', () => {
    expect(classifyHostStop(new WebSocketHandshakeRefused({ status: 401 }))).toEqual({
      retry: 'wait-for-change',
      failure: { type: 'unauthorized', http: 401 },
    })
    expect(classifyHostStop(new WebSocketHandshakeRefused({ status: 426 }))).toEqual({
      retry: 'wait-for-change',
      failure: { type: 'refused', http: 426 },
    })
    expect(classifyHostStop(new AcpStartError({ cause: new Error('ENOENT') }))).toEqual({
      retry: 'wait-for-change',
      failure: { type: 'agent-start' },
    })
  })

  it('restarts after a delay on a protocol close, and at once on anything else', () => {
    expect(classifyHostStop(new WebSocketProtocolClose({ message: 'closed' }))).toEqual({
      retry: 'after-delay',
    })
    expect(classifyHostStop(new WebSocketHandlerError({ cause: new Error('boom') }))).toEqual({
      retry: 'next-poll',
    })
    expect(classifyHostStop(new Error('unknown'))).toEqual({ retry: 'next-poll' })
  })
})
