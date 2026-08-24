import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** The Host cannot start until this machine has a stored credential. */
export class HostNotPairedError extends TaggedError('HostNotPairedError')<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Not paired yet. Run `porte pair` first.', classification: 'terminal' })
  }
}
