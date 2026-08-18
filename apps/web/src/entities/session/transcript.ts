export type TranscriptItem =
  | { readonly kind: 'user'; readonly id: string; readonly text: string }
  | { readonly kind: 'thought'; readonly id: string; readonly text: string }
  | { readonly kind: 'agent'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'tool'
      readonly id: string
      readonly name: string
      readonly status: 'running' | 'done'
      readonly summary: string
    }

export type PermissionOption = {
  readonly id: string
  readonly label: string
}

export type PermissionRequest = {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly options: readonly PermissionOption[]
}

export type TurnStatus = 'idle' | 'streaming' | 'permission'
