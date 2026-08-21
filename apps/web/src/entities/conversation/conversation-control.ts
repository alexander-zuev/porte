import type {
  CodingAgentError,
  ElicitationAnswer,
  PendingElicitation,
  PendingPermission,
} from '@porte/core/client'

/** Progress for a permission response that remains visible in the conversation. */
export type PermissionDecision =
  | { readonly state: 'pending'; readonly request: PendingPermission }
  | {
      readonly state: 'submitting'
      readonly request: PendingPermission
      readonly optionId: string
    }
  | { readonly state: 'failed'; readonly request: PendingPermission; readonly optionId: string }
  | {
      readonly state: 'delivery-unknown'
      readonly request: PendingPermission
      readonly optionId: string
    }
  | { readonly state: 'resolved'; readonly request: PendingPermission; readonly optionId: string }
  | { readonly state: 'cancelled'; readonly request: PendingPermission }
  | { readonly state: 'resolved-elsewhere'; readonly request: PendingPermission }

type ElicitationResponse =
  | { readonly state: 'pending' }
  | { readonly state: 'submitting'; readonly answer: ElicitationAnswer }
  | { readonly state: 'failed'; readonly answer: ElicitationAnswer }
  | { readonly state: 'delivery-unknown'; readonly answer: ElicitationAnswer }
  | { readonly state: 'completed' }
  | { readonly state: 'declined' }
  | { readonly state: 'cancelled' }

/** One raw value edited in a frontend elicitation form. */
export type ElicitationDraftValue = string | boolean

/** Progress and local values for an elicitation response. */
export type ElicitationDecision = {
  readonly request: PendingElicitation
  readonly response: ElicitationResponse
  readonly values: Readonly<Record<string, ElicitationDraftValue>>
  readonly errors: Readonly<Record<string, string>>
}

/** One complete turn-control state for the ready conversation view. */
export type ConversationControl =
  | { readonly state: 'idle' }
  | { readonly state: 'sending' }
  | { readonly state: 'delivery-unknown' }
  | { readonly state: 'running' }
  | { readonly state: 'stopping' }
  | { readonly state: 'cancelled' }
  | { readonly state: 'completed' }
  | { readonly state: 'failed'; readonly error: CodingAgentError }
  | { readonly state: 'permission'; readonly decision: PermissionDecision }
  | { readonly state: 'elicitation'; readonly decision: ElicitationDecision }
