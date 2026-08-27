import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** A registered handler has not been implemented yet. Programmer defect. */
export class HandlerNotImplementedError extends TaggedError('HandlerNotImplementedError')<{
  name: string
  message: string
  classification: FailureClassification
}> {
  constructor(args: { name: string }) {
    super({
      ...args,
      message: `Handler ${args.name} is not implemented`,
      classification: 'terminal',
    })
  }
}

/** A message reached the bus with no registered handler. Programmer defect. */
export class NoHandlerError extends TaggedError('NoHandlerError')<{
  kind: 'command' | 'query'
  name: string
  message: string
  classification: FailureClassification
}> {
  constructor(args: { kind: 'command' | 'query'; name: string }) {
    super({
      ...args,
      message: `No handler for ${args.kind} ${args.name}`,
      classification: 'terminal',
    })
  }
}
