import { isSendableCloseCode, sendableCloseCode } from '@porte/core'
import { describe, expect, it } from 'vitest'

describe('sendableCloseCode', () => {
  // RFC 6455 section 7.4.1: these report a local condition and never travel.
  it.each([1004, 1005, 1006, 1015])('replaces reserved %i with a normal closure', (code) => {
    expect(sendableCloseCode(code)).toBe(1000)
  })

  it.each([1000, 1001, 1003, 1011, 1012, 1014, 3000, 3999, 4000, 4999])(
    'passes %i through',
    (code) => {
      expect(sendableCloseCode(code)).toBe(code)
    },
  )

  it.each([999, 1016, 2999, 5000, -1, 1000.5])('replaces out-of-range %i', (code) => {
    expect(sendableCloseCode(code)).toBe(1000)
  })

  it('agrees with its own predicate', () => {
    expect(isSendableCloseCode(1006)).toBe(false)
    expect(isSendableCloseCode(1012)).toBe(true)
  })
})
