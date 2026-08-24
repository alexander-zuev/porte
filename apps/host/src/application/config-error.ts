import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** The process configuration contains a value the Host cannot use. */
export class ConfigError extends TaggedError('ConfigError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}
