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
    expect(() => parseCommand(['up', '--verbose'])).toThrow(UsageError)
    expect(() => parseCommand(['nope'])).toThrow(UsageError)
  })
})
