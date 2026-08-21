import type { FailureClassification } from './failure-classification.ts'

/**
 * Who is asking to repeat the work.
 *
 * An immediate owner is holding a caller and a socket open. A durable one has
 * already stored the work, so it can afford to try again on something it could
 * not classify.
 */
export type RetryOwner = 'immediate' | 'durable'

/** Decide whether one retry owner can repeat a failed operation. */
// oxlint-disable-next-line typescript/consistent-return -- The switch covers the union, which TypeScript checks and oxlint does not.
export function shouldRetryFailure(args: {
  classification: FailureClassification
  repeatSafe: boolean
  owner: RetryOwner
}): boolean {
  if (!args.repeatSafe) return false

  switch (args.classification) {
    case 'transient':
      return true
    case 'terminal':
      return false
    // Nobody knows what this was. Only an owner holding the work can afford to
    // find out; one holding a caller cannot.
    case 'unknown':
      return args.owner === 'durable'
  }
}
