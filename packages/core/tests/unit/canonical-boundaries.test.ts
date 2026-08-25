import { describe, expect, it } from 'vitest'

import { CanonicalContentSchema } from '../../src/conversation/canonical-content.ts'
import { ConversationFailurePayloadSchema } from '../../src/conversation/conversation-failure-payload.ts'

describe('canonical protocol boundaries', () => {
  it('parses supported content', () => {
    expect(CanonicalContentSchema.safeParse({ type: 'text', text: 'Done' }).success).toBe(true)
    expect(
      CanonicalContentSchema.safeParse({
        type: 'resource-link',
        uri: 'file:///repo/README.md',
        name: 'README.md',
      }).success,
    ).toBe(true)
  })

  it('rejects provider-specific content', () => {
    const result = CanonicalContentSchema.safeParse({ type: 'grok-extension', data: {} })
    expect(result.success).toBe(false)
  })

  it('accepts only public conversation failure tags', () => {
    const publicError = {
      _tag: 'CodingAgentUnavailableError',
      message: 'Agent unavailable',
    }
    const providerError = { _tag: 'GROK_RPC_ERROR', message: 'Raw provider failure' }

    expect(ConversationFailurePayloadSchema.safeParse(publicError).success).toBe(true)
    expect(ConversationFailurePayloadSchema.safeParse(providerError).success).toBe(false)
  })
})
