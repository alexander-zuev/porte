import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const HOST_OFFLINE_ERROR = 'HostOfflineError'
export const HOST_ALREADY_PAIRED_ERROR = 'HostAlreadyPairedError'
export const WORKSPACE_NOT_ALLOWED_ERROR = 'WorkspaceNotAllowedError'

/** The Mac is not holding a socket, so nothing can be asked of it right now. */
export class HostOfflineError extends TaggedError(HOST_OFFLINE_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Host is offline', classification: 'transient' })
  }
}

/** This account already controls a Mac, and the first release pairs one. */
export class HostAlreadyPairedError extends TaggedError(HOST_ALREADY_PAIRED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'This account already has a paired Mac', classification: 'terminal' })
  }
}

/** The path is not one the Mac reported, so the daemon will not open it. */
export class WorkspaceNotAllowedError extends TaggedError(WORKSPACE_NOT_ALLOWED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({
      message: 'That repository is not available on this Mac',
      classification: 'terminal',
    })
  }
}
