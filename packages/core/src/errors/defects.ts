import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

/** A code path that the current step of a migration has not filled in yet. */
export class NotYetImplementedError extends TaggedError('NotYetImplementedError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(step: string) {
    super({ message: `Not implemented until ${step}`, classification: 'terminal' })
  }
}

/**
 * Mark a skeleton body. A defect, not an expected failure: the caller reached
 * code that a later migration step owns.
 *
 * @param step - The step that fills this body in, such as `step 2`.
 * @throws NotYetImplementedError always.
 */
export function notYetImplemented(step: string): never {
  throw new NotYetImplementedError(step)
}
