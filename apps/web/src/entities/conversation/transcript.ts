/** One frontend render projection for the conversation transcript. */
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
