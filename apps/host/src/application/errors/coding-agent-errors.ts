import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** A coding agent does not support a capability required by Porte. */
export class CodingAgentCapabilityError extends TaggedError('CodingAgentCapabilityError')<{
  capability: string
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { capability: string; cause: unknown }) {
    super({
      ...args,
      message: `Coding agent does not support ${args.capability}`,
      classification: 'terminal',
    })
  }
}

/** A coding agent rejected one valid Porte request. */
export class CodingAgentRequestError extends TaggedError('CodingAgentRequestError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'Coding agent rejected the request', classification: 'terminal' })
  }
}

/** A coding agent returned data that Porte cannot use. */
export class CodingAgentResponseError extends TaggedError('CodingAgentResponseError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: 'Coding agent returned an invalid response',
      classification: 'terminal',
    })
  }
}
