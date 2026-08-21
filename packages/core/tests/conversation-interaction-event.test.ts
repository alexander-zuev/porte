import { describe, expect, it } from 'vitest'

import { ConversationElicitationEventSchema } from '../src/conversation/conversation-elicitation-event.ts'
import { ConversationPermissionEventSchema } from '../src/conversation/conversation-permission-event.ts'

const turnId = '0198b55e-49d6-7e0f-9917-b08777b451b9'
const permissionId = '0198b55e-49d7-7b67-922a-2ee176ca2c4c'
const elicitationId = '0198b55e-49d8-7e0f-9917-b08777b451b9'
const base = { eventId: 'event-1', conversationId: 'conversation-1', turnId }

describe('conversation interaction events', () => {
  it('parses a permission request', () => {
    const result = ConversationPermissionEventSchema.safeParse({
      ...base,
      type: 'permission.requested',
      permissionId,
      toolCallId: 'tool-1',
      title: 'Run tests',
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    })

    expect(result.success).toBe(true)
  })

  it('rejects duplicate permission options', () => {
    const option = { optionId: 'allow', name: 'Allow', kind: 'allow_once' }
    const result = ConversationPermissionEventSchema.safeParse({
      ...base,
      type: 'permission.requested',
      permissionId,
      toolCallId: 'tool-1',
      title: 'Run tests',
      options: [option, option],
    })
    expect(result.success).toBe(false)
  })

  it('parses a URL elicitation request', () => {
    const result = ConversationElicitationEventSchema.safeParse({
      ...base,
      type: 'elicitation.requested',
      elicitationId,
      request: { type: 'url', url: 'https://example.com/authorize' },
    })

    expect(result.success).toBe(true)
  })

  it('rejects an unsafe elicitation URL', () => {
    const result = ConversationElicitationEventSchema.safeParse({
      ...base,
      type: 'elicitation.requested',
      elicitationId,
      request: { type: 'url', url: 'javascript:alert(1)' },
    })

    expect(result.success).toBe(false)
  })
})
