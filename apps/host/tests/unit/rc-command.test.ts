import {
  blockDecision,
  parseRcVerb,
  renderStatusResult,
  renderToggleResult,
  renderUnpairResult,
} from '@host/entrypoints/cli/rc-command.ts'
import { describe, expect, it } from 'vitest'

describe('parseRcVerb', () => {
  it('maps each prompt form onto its verb', () => {
    expect(parseRcVerb('/remote-control')).toBe('toggle')
    expect(parseRcVerb('/remote-control ')).toBe('toggle')
    expect(parseRcVerb('/remote-control status')).toBe('status')
    expect(parseRcVerb('/remote-control unpair')).toBe('unpair')
  })

  it('treats an unknown suffix as unknown, never as a toggle', () => {
    expect(parseRcVerb('/remote-control off please')).toBe('unknown')
  })

  it('rejects prompts that are not the command', () => {
    expect(parseRcVerb('tell me about /remote-control')).toBeNull()
    expect(parseRcVerb('remote-control')).toBeNull()
  })
})

describe('rendering', () => {
  it('renders every toggle result as its exact line', () => {
    expect(
      renderToggleResult({
        type: 'pairing-started',
        verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
        userCode: 'ABC123',
      }),
    ).toBe(
      'Open this link on your phone to approve this machine (code ABC123):\n\nhttps://useporte.dev/pair?code=ABC123\n\nIt connects on its own once you approve.',
    )
    expect(
      renderToggleResult({
        type: 'pairing-pending',
        verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
        userCode: 'ABC123',
      }),
    ).toBe(
      'Still waiting for approval. Open this link on your phone (code ABC123):\n\nhttps://useporte.dev/pair?code=ABC123',
    )
    expect(renderToggleResult({ type: 'connected', url: 'https://useporte.dev' })).toBe(
      "Remote control on. Run this machine's Grok sessions from your phone: https://useporte.dev",
    )
    expect(renderToggleResult({ type: 'connecting', url: 'https://useporte.dev' })).toBe(
      'Turning remote control on. Run /remote-control status in a moment.',
    )
    expect(renderToggleResult({ type: 'disconnected' })).toBe('Remote control off.')
  })

  it('renders every status result as its exact line', () => {
    expect(renderStatusResult({ type: 'on', url: 'https://useporte.dev' })).toBe(
      'Remote control on · https://useporte.dev',
    )
    expect(renderStatusResult({ type: 'off', hostName: 'a-mac' })).toBe(
      'Remote control off · paired as "a-mac"',
    )
    expect(renderStatusResult({ type: 'not-paired' })).toBe('Remote control off · not paired')
  })

  it('renders every unpair result as its exact line', () => {
    expect(renderUnpairResult({ type: 'unpaired' })).toBe(
      'This machine is removed from your Porte account. Run /remote-control to pair again.',
    )
    expect(renderUnpairResult({ type: 'not-paired' })).toBe('This machine is not paired.')
  })
})

describe('blockDecision', () => {
  it('produces the JSON grok expects', () => {
    expect(JSON.parse(blockDecision('Remote control off.'))).toEqual({
      decision: 'block',
      reason: 'Remote control off.',
    })
  })
})
