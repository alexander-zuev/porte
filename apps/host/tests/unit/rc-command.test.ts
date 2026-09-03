import {
  blockDecision,
  renderStatusLineResult,
  renderStatusResult,
  renderSwitchResult,
  renderUnpairResult,
  statusLineNote,
} from '@host/entrypoints/cli/rc-command.ts'
import { parsePromptVerb, parseRcWords } from '@host/entrypoints/cli/rc-verb.ts'
import { describe, expect, it } from 'vitest'

describe('parsePromptVerb', () => {
  it('maps each prompt form onto its verb', () => {
    expect(parsePromptVerb('/remote-control')).toEqual({ kind: 'remote', to: 'toggle' })
    expect(parsePromptVerb('/remote-control ')).toEqual({ kind: 'remote', to: 'toggle' })
    expect(parsePromptVerb('/remote-control on')).toEqual({ kind: 'remote', to: 'on' })
    expect(parsePromptVerb('/remote-control off')).toEqual({ kind: 'remote', to: 'off' })
    expect(parsePromptVerb('/remote-control status')).toEqual({ kind: 'status' })
    expect(parsePromptVerb('/remote-control status-line')).toEqual({
      kind: 'status-line',
      to: 'toggle',
    })
    expect(parsePromptVerb('/remote-control status-line off')).toEqual({
      kind: 'status-line',
      to: 'off',
    })
    expect(parsePromptVerb('/remote-control unpair')).toEqual({ kind: 'unpair' })
  })

  it('treats unknown words as unknown, never as a toggle; plugin verbs are not for prompts', () => {
    expect(parsePromptVerb('/remote-control off please')).toBe('unknown')
    expect(parsePromptVerb('/remote-control status-line maybe')).toBe('unknown')
    expect(parsePromptVerb('/remote-control hook')).toBe('unknown')
  })

  it('rejects prompts that are not the command', () => {
    expect(parsePromptVerb('tell me about /remote-control')).toBeNull()
    expect(parsePromptVerb('remote-control')).toBeNull()
  })
})

describe('parseRcWords', () => {
  it('accepts the plugin verbs and refuses extra words', () => {
    expect(parseRcWords(['hook'])).toEqual({ kind: 'hook' })
    expect(parseRcWords(['watch-pairing'])).toEqual({ kind: 'watch-pairing' })
    expect(parseRcWords(['toggle'])).toEqual({ kind: 'remote', to: 'toggle' })
    expect(parseRcWords(['on', 'now'])).toBeNull()
    expect(parseRcWords(['status', 'line'])).toBeNull()
    expect(parseRcWords(['dance'])).toBeNull()
  })
})

describe('rendering', () => {
  it('renders every status-line outcome and note as its exact line', () => {
    expect(renderStatusLineResult(true, 'added')).toBe(
      'Status row on. Restart Grok to see the /rc row.',
    )
    expect(renderStatusLineResult(true, 'unwritable')).toBe(
      'Status row on, but ~/.grok/config.toml could not be written.',
    )
    expect(renderStatusLineResult(false, 'off')).toBe('Status row off. Restart Grok to hide it.')
    expect(statusLineNote('current')).toBe('')
    expect(statusLineNote('off')).toBe('')
    expect(statusLineNote('added')).toBe('\nRestart Grok once to see the /rc status row.')
    expect(statusLineNote('theirs')).toBe(
      '\nGrok already has a status line of its own. /remote-control status-line replaces it with the /rc row.',
    )
  })

  it('renders every switch result as its exact line', () => {
    expect(renderSwitchResult({ type: 'not-paired' })).toBe(
      'This machine is not paired. Run /remote-control to pair.',
    )
    expect(
      renderSwitchResult({
        type: 'pairing-started',
        verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
        userCode: 'ABC123',
      }),
    ).toBe(
      'Open this link on your phone to approve this machine (code ABC123):\n\nhttps://useporte.dev/pair?code=ABC123\n\nIt connects on its own once you approve.',
    )
    expect(
      renderSwitchResult({
        type: 'pairing-pending',
        verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
        userCode: 'ABC123',
      }),
    ).toBe(
      'Still waiting for approval. Open this link on your phone (code ABC123):\n\nhttps://useporte.dev/pair?code=ABC123',
    )
    expect(renderSwitchResult({ type: 'connected', url: 'https://useporte.dev' })).toBe(
      "Remote control on. Run this machine's Grok sessions from your phone: https://useporte.dev",
    )
    expect(renderSwitchResult({ type: 'connecting', url: 'https://useporte.dev' })).toBe(
      'Turning remote control on. Run /remote-control status in a moment.',
    )
    expect(renderSwitchResult({ type: 'disconnected' })).toBe('Remote control off.')
  })

  it('renders every status result as its exact line', () => {
    expect(renderStatusResult({ type: 'on', url: 'https://useporte.dev' })).toBe(
      'Remote control on · https://useporte.dev',
    )
    expect(renderStatusResult({ type: 'off', hostName: 'a-mac' })).toBe(
      'Remote control off · paired as "a-mac"',
    )
    expect(renderStatusResult({ type: 'not-paired' })).toBe('Remote control off · not paired')
    expect(renderStatusResult({ type: 'connecting' })).toBe('Remote control connecting…')
    expect(
      renderStatusResult({ type: 'error', failure: { type: 'unauthorized', http: 403 } }),
    ).toBe('Remote control error · pairing revoked · /remote-control to pair again')
    expect(renderStatusResult({ type: 'error', failure: { type: 'refused', http: 426 } })).toBe(
      'Remote control error · Porte refused (HTTP 426) · update Porte',
    )
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
