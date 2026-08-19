import { describe, expect, it } from 'vitest'

import { CanonicalContentSchema } from '../src/canonical-content.ts'
import { CodingAgentErrorSchema } from '../src/coding-agent-error.ts'

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

  it('accepts only public coding-agent error codes', () => {
    const publicError = { code: 'CODING_AGENT_UNAVAILABLE', message: 'Agent unavailable' }
    const providerError = { code: 'GROK_RPC_ERROR', message: 'Raw provider failure' }

    expect(CodingAgentErrorSchema.safeParse(publicError).success).toBe(true)
    expect(CodingAgentErrorSchema.safeParse(providerError).success).toBe(false)
  })
})
