import { describe, expect, it } from 'vitest'

import { ConversationNotFoundError, isDomainError } from '../../src/client.ts'

/** A tagged error as Workers RPC delivers it: own properties survive, the prototype does not. */
function remoteError(props: { _tag: string; remote?: boolean }): Error {
  return Object.assign(new Error('conversation not found'), props)
}

describe('isDomainError', () => {
  it('accepts a native tagged error', () => {
    expect(isDomainError(new ConversationNotFoundError())).toBe(true)
  })

  it('accepts a tagged error from Workers RPC without throwing', () => {
    const cause = remoteError({ _tag: 'ConversationNotFoundError', remote: true })
    expect(isDomainError(cause)).toBe(true)
  })

  it('rejects a tagged error missing the remote stamp', () => {
    expect(isDomainError(remoteError({ _tag: 'ConversationNotFoundError' }))).toBe(false)
  })

  it('rejects a tag outside the domain table', () => {
    expect(isDomainError(remoteError({ _tag: 'SomethingElse', remote: true }))).toBe(false)
  })

  it('rejects a non-error value carrying the shape', () => {
    expect(isDomainError({ _tag: 'ConversationNotFoundError', message: 'x', remote: true })).toBe(
      false,
    )
  })
})
