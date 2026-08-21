import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

/** Required runtime configuration is absent; retrying cannot repair the deployment. */
export class MissingConfigurationError extends TaggedError('MissingConfigurationError')<{
  key: string
  message: string
  classification: FailureClassification
}> {
  constructor(key: string) {
    super({ key, message: `${key} is required`, classification: 'terminal' })
  }
}
