import { describe, expect, it } from 'vitest'

import { HELP, LIST_HELP, RESUME_HELP, UP_HELP, parseCommand } from '../src/cli/parse-command.ts'
import { UsageError } from '../src/errors.ts'

describe('parseCommand', () => {
  it('parses help and version', () => {
    expect(parseCommand(['--help'])).toEqual({ kind: 'help', text: HELP })
    expect(parseCommand(['-h'])).toEqual({ kind: 'help', text: HELP })
    expect(parseCommand(['resume', '--help'])).toEqual({ kind: 'help', text: RESUME_HELP })
    expect(parseCommand(['list', '--help'])).toEqual({ kind: 'help', text: LIST_HELP })
    expect(parseCommand(['up', '--help'])).toEqual({ kind: 'help', text: UP_HELP })
    expect(parseCommand(['--version'])).toEqual({ kind: 'version' })
    expect(parseCommand(['-V'])).toEqual({ kind: 'version' })
  })

  it('parses list and resume', () => {
    expect(parseCommand(['list'])).toEqual({ kind: 'list', verbose: false })
    expect(parseCommand(['resume', 'abc', '--prompt', 'hi'])).toEqual({
      kind: 'resume',
      sessionId: 'abc',
      prompt: 'hi',
      verbose: false,
    })
    expect(parseCommand(['list', '--verbose'])).toEqual({ kind: 'list', verbose: true })
  })

  it('parses the host command', () => {
    expect(parseCommand(['up'])).toEqual({ kind: 'up', relayUrl: undefined, verbose: false })
    expect(parseCommand(['up', '--url', 'ws://localhost:8787/api/host/ws'])).toEqual({
      kind: 'up',
      relayUrl: 'ws://localhost:8787/api/host/ws',
      verbose: false,
    })
  })

  it('rejects unknown argv', () => {
    expect(() => parseCommand([])).toThrow(UsageError)
    expect(() => parseCommand(['resume', 'abc'])).toThrow(UsageError)
    expect(() => parseCommand(['nope'])).toThrow(UsageError)
  })
})
