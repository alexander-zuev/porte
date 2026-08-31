import { UsageError } from '@host/entrypoints/cli/cli-error.ts'
import {
  HELP,
  PAIR_HELP,
  UNPAIR_HELP,
  UP_HELP,
  parseCommand,
} from '@host/entrypoints/cli/parse-command.ts'
import { describe, expect, it } from 'vitest'

describe('parseCommand', () => {
  it('parses help and version', () => {
    expect(parseCommand(['--help'])).toEqual({ kind: 'help', text: HELP })
    expect(parseCommand(['-h'])).toEqual({ kind: 'help', text: HELP })
    expect(parseCommand(['pair', '--help'])).toEqual({ kind: 'help', text: PAIR_HELP })
    expect(parseCommand(['unpair', '--help'])).toEqual({ kind: 'help', text: UNPAIR_HELP })
    expect(parseCommand(['up', '--help'])).toEqual({ kind: 'help', text: UP_HELP })
    expect(parseCommand(['--version'])).toEqual({ kind: 'version' })
    expect(parseCommand(['-V'])).toEqual({ kind: 'version' })
  })

  it('parses the host command', () => {
    expect(parseCommand(['up'])).toEqual({ kind: 'up' })
  })

  it('parses the pair command', () => {
    expect(parseCommand(['pair'])).toEqual({ kind: 'pair' })
  })

  it('rejects unknown argv', () => {
    expect(() => parseCommand([])).toThrow(UsageError)
    expect(() => parseCommand(['list'])).toThrow(UsageError)
    expect(() => parseCommand(['resume'])).toThrow(UsageError)
    expect(() => parseCommand(['up', '--json'])).toThrow(UsageError)
    expect(() => parseCommand(['nope'])).toThrow(UsageError)
  })

  it('accepts --verbose, which main.ts applies before the CLI loads', () => {
    expect(parseCommand(['up', '--verbose'])).toEqual({ kind: 'up' })
    expect(parseCommand(['-v', 'up'])).toEqual({ kind: 'up' })
  })

  it('parses the mcp command', () => {
    expect(parseCommand(['mcp'])).toEqual({ kind: 'mcp' })
  })

  it('parses each rc verb', () => {
    expect(parseCommand(['rc', 'hook'])).toEqual({ kind: 'rc', verb: 'hook' })
    expect(parseCommand(['rc', 'toggle'])).toEqual({ kind: 'rc', verb: 'toggle' })
    expect(parseCommand(['rc', 'status'])).toEqual({ kind: 'rc', verb: 'status' })
    expect(parseCommand(['rc', 'unpair'])).toEqual({ kind: 'rc', verb: 'unpair' })
    expect(parseCommand(['rc', 'watch-pairing'])).toEqual({ kind: 'rc', verb: 'watch-pairing' })
  })

  it('rejects rc without a verb and with an unknown verb', () => {
    expect(() => parseCommand(['rc'])).toThrow(UsageError)
    expect(() => parseCommand(['rc', 'nope'])).toThrow(UsageError)
  })
})
