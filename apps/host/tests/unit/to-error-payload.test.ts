import { toErrorPayload } from '@host/infrastructure/errors/to-error-payload.ts'
import {
  ConversationBusyError,
  OperationConflictError,
  ServiceUnavailableError,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('toErrorPayload', () => {
  it('passes a domain error through', () => {
    expect(toErrorPayload(new ConversationBusyError())).toEqual({
      _tag: 'ConversationBusyError',
      message: new ConversationBusyError().message,
    })
    expect(toErrorPayload(new ServiceUnavailableError())._tag).toBe('ServiceUnavailableError')
    expect(toErrorPayload(new OperationConflictError())._tag).toBe('OperationConflictError')
  })

  it('collapses an unknown throw to InternalServerError', () => {
    expect(toErrorPayload(new Error('boom'))).toEqual({
      _tag: 'InternalServerError',
      message: 'Something went wrong',
    })
  })
})
